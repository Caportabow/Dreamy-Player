import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from './env'
import {
  downloadAudio,
  fetchMetadata,
  MAX_SEARCH_PAGES,
  search,
  YOUTUBE_CLIENTS,
  YtError,
  type FullMetadata,
} from './yt'
import { toMp3, toWebpSquare } from './ffmpeg'
import { ensureBuckets, uploadFile } from './storage'
import { reportComplete, reportFailure, reportProgress } from './nuxt'
import { enrichResults, getEnrichment, resolveEnrichmentForDownload, type EnrichedResult } from './enrich'

const app = express()
app.use(express.json({ limit: '256kb' }))

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!env.serviceSecret || token !== env.serviceSecret) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dreamy-download-service' })
})

/** Search cache: repeat queries (per page) are served instantly. Long enough
 * that re-searching the same song doesn't re-hit YouTube/iTunes, short enough
 * that new uploads still surface within a few minutes. */
const SEARCH_CACHE_TTL_MS = 10 * 60_000
const searchCache = new Map<string, { at: number; results: EnrichedResult[]; hasMore: boolean }>()

/** Search YouTube in metadata-only mode; only ≤10min results are returned. */
app.post('/search', requireAuth, async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 200) : ''
  if (!query) {
    res.status(400).json({ error: 'missing_query' })
    return
  }
  const page = Math.min(Math.max(Number(req.body?.page) || 1, 1), MAX_SEARCH_PAGES)
  const cacheKey = `${query}::p${page}`
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    res.json({ results: cached.results, hasMore: cached.hasMore })
    return
  }
  try {
    // YouTube search first, then normalize with the iTunes catalog (which
    // also collapses duplicate uploads) and attach cover art + previews.
    // The two stages are timed separately so slow searches can be diagnosed
    // (see docker logs) instead of guessed at.
    const t0 = Date.now()
    const { videos, hasMore } = await search(query, env.maxDuration, page)
    const t1 = Date.now()
    // The browser fires a new search on every keystroke and abandons the
    // earlier ones (Nuxt aborts them on disconnect). Enrichment is the
    // expensive, rate-limited stage — if nobody is listening, stop before it
    // so the iTunes budget isn't burned on results nobody will see.
    // Note: only `res.destroyed` signals a real disconnect — `req.destroyed`
    // also becomes true on completely normal requests once the body has been
    // consumed, and would make us drop perfectly good searches.
    if (res.destroyed) return
    const results = await enrichResults(videos)
    console.log(
      `[search] "${query}" p${page}: yt-dlp stage ${t1 - t0}ms, enrichment ${Date.now() - t1}ms, total ${Date.now() - t0}ms, ${results.length} results`,
    )
    searchCache.set(cacheKey, { at: Date.now(), results, hasMore })
    if (searchCache.size > 400) {
      const now = Date.now()
      for (const [key, value] of searchCache) {
        if (now - value.at > SEARCH_CACHE_TTL_MS) searchCache.delete(key)
      }
    }
    res.json({ results, hasMore })
  } catch (err) {
    if (err instanceof YtError) {
      res.status(422).json({ error: err.code, message: err.message })
      return
    }
    res.status(500).json({ error: 'search_failure' })
  }
})

interface DownloadRequest {
  jobId?: string
  sourceUrl?: string
  title?: string
  artist?: string
  duration?: number
  artworkUrl?: string
}

/** Accept a download job; processing continues in the background. */
app.post('/download', requireAuth, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as DownloadRequest
  const jobId = typeof body.jobId === 'string' ? body.jobId : ''
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : ''

  if (!jobId) {
    res.status(400).json({ error: 'missing_job_id' })
    return
  }
  if (!sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) {
    res.status(400).json({ error: 'invalid_source_url' })
    return
  }

  res.status(202).json({ accepted: true })

  processJob({
    jobId,
    sourceUrl,
    artworkUrl: typeof body.artworkUrl === 'string' ? body.artworkUrl : '',
  }).catch((err) => {
    console.error('[worker] unexpected job error', jobId, err)
  })
})

async function processJob(input: { jobId: string; sourceUrl: string; artworkUrl: string }): Promise<void> {
  const { jobId, sourceUrl } = input
  let dir: string | null = null
  try {
    // 1. Independently re-fetch and validate metadata (ten-minute rule enforced here).
    //    When the video came from a search, this is served from the metadata cache.
    await reportProgress(jobId, { status: 'searching', stage: 'Re-checking the video…', progress: 5 })
    const meta = await fetchMetadata(sourceUrl, env.maxDuration)

    // Normalize the name and artist with the iTunes catalog — reuse the
    // enrichment found during the search, or run a fresh lookup. The real
    // cover comes straight from iTunes too. All best-effort.
    const enrichment =
      getEnrichment(meta.url) ?? (await resolveEnrichmentForDownload(meta, meta.raw))
    const title = enrichment?.title || meta.title
    const artist = enrichment?.artist || meta.artist
    const album = enrichment?.album || null
    const coverUrl = enrichment?.artworkUrl ?? null

    dir = await mkdtemp(path.join(env.tempDir, 'job-'))

    // Real progress: yt-dlp's byte percentage drives the download band, the
    // ffmpeg encode clock drives the conversion band, upload lands at 92/96.
    // Reporting is throttled to ~1/s — the UI polls every 2.5s, so anything
    // finer is wasted HTTP.
    const DOWNLOAD_RANGE = { min: 30, max: 70 }
    const CONVERT_RANGE = { min: 70, max: 90 }
    let lastReportedStatus = ''
    let lastReportedPct = -1
    let lastReportedAt = 0
    const reportPct = (status: string, stage: string, pct: number): void => {
      const rounded = Math.max(0, Math.min(100, Math.round(pct)))
      const now = Date.now()
      if (status === lastReportedStatus && rounded === lastReportedPct) return
      if (status === lastReportedStatus && now - lastReportedAt < 800 && rounded < 99) return
      lastReportedStatus = status
      lastReportedPct = rounded
      lastReportedAt = now
      reportProgress(jobId, { status, stage, progress: rounded })
    }

    // 2. Download the audio stream while the artwork is fetched/converted in
    //    parallel — the two share no resources, so neither waits on the other.
    reportPct('downloading', 'Gently downloading…', DOWNLOAD_RANGE.min)
    const artworkPromise = prepareArtwork(meta, coverUrl || input.artworkUrl, dir)
    // Player clients disagree on what they serve for claim-restricted videos:
    // one can hand out a muted/partial stream (which the conversion stage
    // rejects) while another serves the real audio. Each client gets one
    // download+convert attempt; the first that produces a real track wins.
    const trackId = randomUUID()
    const mp3Path = path.join(dir, `${meta.id}.mp3`)
    let converted = false
    let lastErr: unknown = null
    for (const client of YOUTUBE_CLIENTS) {
      try {
        reportPct('downloading', 'Gently downloading…', DOWNLOAD_RANGE.min)
        const audioPath = await downloadAudio(sourceUrl, dir, meta.id, client, (fraction) => {
          reportPct(
            'downloading',
            'Gently downloading…',
            DOWNLOAD_RANGE.min + fraction * (DOWNLOAD_RANGE.max - DOWNLOAD_RANGE.min),
          )
        })
        reportPct('converting', 'Normalizing the sound…', CONVERT_RANGE.min)
        await toMp3(audioPath, mp3Path, { title, artist, album: album || undefined }, (fraction) => {
          reportPct(
            'converting',
            'Normalizing the sound…',
            CONVERT_RANGE.min + fraction * (CONVERT_RANGE.max - CONVERT_RANGE.min),
          )
        })
        converted = true
        break
      } catch (err: any) {
        lastErr = err
        console.error(`[worker] attempt with player client ${client} failed`, err?.message || err)
        // Clear this attempt's files so the next client starts clean.
        for (const file of await readdir(dir)) {
          if (file.startsWith(`${client}-`)) {
            await rm(path.join(dir, file), { force: true }).catch(() => {})
          }
        }
        await rm(mp3Path, { force: true }).catch(() => {})
      }
    }
    if (!converted) {
      throw lastErr instanceof Error ? lastErr : new Error('The download failed.')
    }
    const artworkKey = await artworkPromise

    // 4. Upload the MP3.
    reportPct('uploading', 'Tucking it into the library…', 92)
    const audioKey = `audio/${trackId}/track.mp3`
    await uploadFile(env.buckets.audio, audioKey, mp3Path, 'audio/mpeg')

    reportPct('uploading', 'Almost there…', 96)

    // 5. Tell Nuxt to create the track record (Nuxt re-validates everything).
    await reportComplete(jobId, {
      id: trackId,
      title,
      artist,
      album,
      itunesId: enrichment?.itunesId ?? null,
      duration: meta.duration ?? 0,
      audioKey,
      artworkKey,
      sourceUrl: meta.url,
      sourceId: meta.id,
    })
  } catch (err) {
    const code = err instanceof YtError ? err.code : (err as any)?.code || 'download_failure'
    const message = err instanceof Error ? err.message : 'The download failed.'
    console.error('[worker] job failed', jobId, code, message)
    await reportFailure(jobId, message, code)
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

/**
 * Download, square-crop, and upload the cover artwork (optional; never fatal).
 * Runs concurrently with the audio download.
 */
async function prepareArtwork(meta: FullMetadata, artworkUrl: string, dir: string): Promise<string | null> {
  let artworkKey: string | null = null
  const artworkSource = artworkUrl.startsWith('http') ? artworkUrl : (meta.thumbnail || '')
  if (!artworkSource) return null
  try {
    const thumbPath = path.join(dir, 'thumb.jpg')
    const res = await fetch(artworkSource, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    await writeFile(thumbPath, Buffer.from(await res.arrayBuffer()))
    const webpPath = path.join(dir, 'cover.webp')
    if (await toWebpSquare(thumbPath, webpPath)) {
      artworkKey = `artwork/${meta.id}/cover.webp`
      await uploadFile(env.buckets.artwork, artworkKey, webpPath, 'image/webp')
    } else {
      artworkKey = `artwork/${meta.id}/cover.jpg`
      await uploadFile(env.buckets.artwork, artworkKey, thumbPath, 'image/jpeg')
    }
  } catch (err) {
    console.error('[worker] artwork upload skipped', err)
    return null
  }
  return artworkKey
}

await mkdir(env.tempDir, { recursive: true })
await ensureBuckets()

app.listen(env.port, () => {
  console.log(`[worker] dreamy download service listening on :${env.port}`)
})
