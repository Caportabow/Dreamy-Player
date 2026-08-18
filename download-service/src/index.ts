import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from './env'
import { downloadAudio, fetchMetadata, search, YtError, type FullMetadata, type VideoInfo } from './yt'
import { toMp3, toWebpSquare } from './ffmpeg'
import { ensureBuckets, uploadFile } from './storage'
import { reportComplete, reportFailure, reportProgress } from './nuxt'

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

/** Short-lived search cache: repeat queries are served instantly. */
const SEARCH_CACHE_TTL_MS = 3 * 60_000
const searchCache = new Map<string, { at: number; results: VideoInfo[] }>()

/** Search YouTube in metadata-only mode; only ≤5min results are returned. */
app.post('/search', requireAuth, async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 200) : ''
  if (!query) {
    res.status(400).json({ error: 'missing_query' })
    return
  }
  const cached = searchCache.get(query)
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    res.json({ results: cached.results })
    return
  }
  try {
    const results = await search(query, env.maxDuration)
    searchCache.set(query, { at: Date.now(), results })
    if (searchCache.size > 200) {
      const now = Date.now()
      for (const [key, value] of searchCache) {
        if (now - value.at > SEARCH_CACHE_TTL_MS) searchCache.delete(key)
      }
    }
    res.json({ results })
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
    // 1. Independently re-fetch and validate metadata (five-minute rule enforced here).
    //    When the video came from a search, this is served from the metadata cache.
    await reportProgress(jobId, { status: 'searching', stage: 'Re-checking the video…', progress: 5 })
    const meta = await fetchMetadata(sourceUrl, env.maxDuration)

    dir = await mkdtemp(path.join(env.tempDir, 'job-'))

    // 2. Download the audio stream while the artwork is fetched/converted in
    //    parallel — the two share no resources, so neither waits on the other.
    await reportProgress(jobId, { status: 'downloading', stage: 'Gently downloading…', progress: 30 })
    const artworkPromise = prepareArtwork(meta, input.artworkUrl, dir)
    const audioPath = await downloadAudio(sourceUrl, dir, meta.id)
    const artworkKey = await artworkPromise

    // 3. Convert to MP3 with embedded metadata.
    await reportProgress(jobId, { status: 'converting', stage: 'Wrapping it in a pillow…', progress: 60 })
    const trackId = randomUUID()
    const mp3Path = path.join(dir, `${meta.id}.mp3`)
    await toMp3(audioPath, mp3Path, { title: meta.title, artist: meta.artist })

    // 4. Upload the MP3.
    await reportProgress(jobId, { status: 'uploading', stage: 'Tucking it into the library…', progress: 80 })
    const audioKey = `audio/${trackId}/track.mp3`
    await uploadFile(env.buckets.audio, audioKey, mp3Path, 'audio/mpeg')

    await reportProgress(jobId, { status: 'uploading', stage: 'Almost there…', progress: 95 })

    // 5. Tell Nuxt to create the track record (Nuxt re-validates everything).
    await reportComplete(jobId, {
      id: trackId,
      title: meta.title,
      artist: meta.artist,
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
