import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const YTDLP = 'yt-dlp'

export interface VideoInfo {
  id: string
  title: string
  artist: string
  duration: number | null
  thumbnail: string | null
  url: string
}

export interface FullMetadata extends VideoInfo {
  raw: any
}

export class YtError extends Error {
  code: string
  constructor(message: string, code = 'yt_dlp_error') {
    super(message)
    this.code = code
  }
}

/** A stalled YouTube connection fails fast instead of hanging until the kill timeout. */
const SOCKET_TIMEOUT = '15'

/** How long a full-metadata fetch stays reusable (search enrichment + download re-check). */
const META_CACHE_TTL_MS = 10 * 60_000

function run(args: string[], timeoutMs = 90_000): Promise<{ stdout: string; stderr: string }> {
  // Prefer the deno JS runtime (installed in the worker image) so YouTube
  // extraction is complete — without it, durations are often missing.
  return execFileAsync(
    YTDLP,
    ['--js-runtimes', 'deno', '--socket-timeout', SOCKET_TIMEOUT, '--no-warnings', ...args],
    {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      killSignal: 'SIGKILL',
    },
  )
}

function pickThumbnail(raw: any): string | null {
  if (typeof raw.thumbnail === 'string' && raw.thumbnail) return raw.thumbnail
  const thumbs = Array.isArray(raw.thumbnails) ? raw.thumbnails : []
  for (let i = thumbs.length - 1; i >= 0; i--) {
    const url = thumbs[i]?.url
    if (typeof url === 'string' && url) return url
  }
  return null
}

function mapVideo(raw: any): VideoInfo {
  const duration = typeof raw.duration === 'number' && Number.isFinite(raw.duration)
    ? Math.round(raw.duration)
    : null
  return {
    id: String(raw.id || ''),
    title: String(raw.title || 'Untitled'),
    artist: String(raw.channel || raw.uploader || 'Unknown artist'),
    duration,
    thumbnail: pickThumbnail(raw),
    url: `https://www.youtube.com/watch?v=${String(raw.id || '')}`,
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Search YouTube and return only results with a known duration of 1–600s.
 *
 * Uses a flat search (`ytsearchN` with `--flat-playlist`): a single innertube
 * call that returns entries with authoritative durations straight from
 * YouTube's search response. This is dramatically faster and more stable than
 * deep-extracting every video, which repeatedly trips bot detection from
 * datacenter IPs. Only entries whose duration is missing are enriched with a
 * full metadata fetch, so the ten-minute rule still holds without paying for
 * per-video re-extraction in the common case.
 *
 * Pagination: `page` slices the search results (10 per page) via
 * `--playlist-start/--playlist-end`. `hasMore` reports whether the raw page
 * was full, i.e. there may be further results — but never beyond
 * MAX_SEARCH_PAGES, so a popular query can't turn into an endless list (and
 * YouTube's search continuation gets unstable/slow the deeper you go).
 */
export const MAX_SEARCH_PAGES = 3

export async function search(
  query: string,
  maxDuration: number,
  page = 1,
): Promise<{ videos: VideoInfo[]; hasMore: boolean }> {
  const WINDOW = 10
  const start = (page - 1) * WINDOW + 1
  const end = page * WINDOW

  let stdout = ''
  let lastErr: any = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await run(
        [
          '--flat-playlist',
          '--no-playlist',
          '--skip-download',
          '--dump-json',
          `ytsearch${end}:${query}`,
          '--playlist-start',
          String(start),
          '--playlist-end',
          String(end),
        ],
        45_000,
      )
      stdout = res.stdout
      break
    } catch (err: any) {
      lastErr = err
      const stderr: string = err?.stderr || err?.message || ''
      if (/no results|did not match|Unsupported URL/i.test(stderr)) {
        throw new YtError('No matching results were found.', 'no_results')
      }
      // Transient hiccup — retry once before giving up.
      if (attempt === 0) await sleep(1_200)
    }
  }
  if (!stdout) {
    const stderr: string = lastErr?.stderr || lastErr?.message || ''
    throw new YtError('yt-dlp search failed: ' + stderr.slice(0, 300), 'search_failure')
  }

  // Shallow results from the search response.
  const shallow: VideoInfo[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      shallow.push(mapVideo(JSON.parse(trimmed)))
    } catch {
      // skip malformed lines
    }
  }
  // A full page suggests there is more beyond it — up to the page cap.
  const hasMore = shallow.length >= WINDOW && page < MAX_SEARCH_PAGES

  // Seed the metadata cache with the search response's own durations, so a
  // download of a picked result skips the separate re-validation fetch.
  for (const v of shallow) {
    if (v.duration !== null && v.duration >= 1 && v.duration <= maxDuration) {
      metaCache.set(v.url, { at: Date.now(), meta: { ...v, raw: {} } })
    }
  }

  // Pre-filter: drop entries already known to exceed the limit.
  const candidates = shallow
    .filter((v) => v.duration === null || (v.duration >= 1 && v.duration <= maxDuration))
    .slice(0, WINDOW)

  if (candidates.length === 0) return { videos: [], hasMore }

  // Only videos with an unknown duration need a full metadata fetch.
  const missing = candidates.filter((c) => c.duration === null)
  if (missing.length > 0) {
    const enriched: VideoInfo[] = []
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < missing.length) {
        const index = cursor++
        const candidate = missing[index]!
        try {
          const full = await fetchMetadata(candidate.url, maxDuration)
          enriched.push({
            id: full.id,
            title: full.title,
            artist: full.artist,
            duration: full.duration,
            thumbnail: full.thumbnail,
            url: full.url,
          })
        } catch {
          // Unavailable, private, or over the limit — the shallow entry is
          // kept but dropped by the final duration filter if unresolved.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(WINDOW, missing.length) }, worker))
    const byUrl = new Map(enriched.map((e) => [e.url, e]))
    return {
      videos: candidates
        .map((c) => byUrl.get(c.url) ?? c)
        .filter((v) => v.duration !== null && v.duration >= 1 && v.duration <= maxDuration),
      hasMore,
    }
  }

  return {
    videos: candidates.filter((v) => v.duration !== null && v.duration >= 1 && v.duration <= maxDuration),
    hasMore,
  }
}

// Reusable metadata, keyed by watch URL, so repeat searches and the
// download-time re-validation don't re-extract the same video.
const metaCache = new Map<string, { at: number; meta: FullMetadata }>()

/**
 * Re-fetch full metadata for a video and validate the duration independently
 * of anything the client provided. Throws YtError when the video is unusable.
 */
export async function fetchMetadata(url: string, maxDuration: number): Promise<FullMetadata> {
  const cached = metaCache.get(url)
  if (cached && Date.now() - cached.at < META_CACHE_TTL_MS) {
    if (cached.meta.duration !== null && cached.meta.duration > maxDuration) {
      throw new YtError('This video is longer than ten minutes.', 'too_long')
    }
    return cached.meta
  }

  let stdout: string
  try {
    const res = await run(['--no-playlist', '--skip-download', '--dump-single-json', url], 60_000)
    stdout = res.stdout
  } catch (err: any) {
    const stderr: string = err?.stderr || err?.message || ''
    if (/unavailable|removed|private/i.test(stderr)) {
      throw new YtError('This video is unavailable.', 'video_unavailable')
    }
    throw new YtError('Could not read the video metadata.', 'metadata_failure')
  }

  let raw: any
  try {
    raw = JSON.parse(stdout)
  } catch {
    throw new YtError('Could not read the video metadata.', 'metadata_failure')
  }

  const duration = typeof raw.duration === 'number' && Number.isFinite(raw.duration)
    ? Math.round(raw.duration)
    : null

  // The ten-minute rule is enforced here, immediately before downloading.
  if (duration === null || duration <= 0) {
    throw new YtError('The video duration could not be determined.', 'unknown_duration')
  }
  if (duration > maxDuration) {
    throw new YtError('This video is longer than ten minutes.', 'too_long')
  }

  const meta = { ...mapVideo(raw), duration, raw }
  metaCache.set(url, { at: Date.now(), meta })
  if (metaCache.size > 300) {
    const now = Date.now()
    for (const [key, value] of metaCache) {
      if (now - value.at > META_CACHE_TTL_MS) metaCache.delete(key)
    }
  }
  return meta
}

/**
 * Player clients to try for YouTube media downloads, in order.
 *
 * yt-dlp's default multi-client mode can resolve media URLs that YouTube
 * answers with HTTP 403 from datacenter IPs; pinning a single client (with
 * fallbacks) avoids that.
 */
const YOUTUBE_CLIENTS = ['web', 'android', 'tv']

/** Download the best available audio stream into outDir. Returns the file path. */
export async function downloadAudio(url: string, outDir: string, videoId: string): Promise<string> {
  const template = `${outDir}/${videoId}.%(ext)s`
  let lastErr: any = null
  for (const client of YOUTUBE_CLIENTS) {
    try {
      await run(
        [
          '--extractor-args', `youtube:player_client=${client}`,
          '-f', 'bestaudio/best',
          '-o', template,
          '--no-playlist',
          '--no-part',
          '--no-mtime',
          '--socket-timeout', '20',
          // YouTube audio streams are DASH-fragmented; fetch fragments in
          // parallel instead of serially.
          '--concurrent-fragments', '8',
          '--no-ignore-errors',
          url,
        ],
        240_000,
      )
      const fs = await import('node:fs')
      const files = fs.readdirSync(outDir).filter((f) => f.startsWith(videoId))
      if (files.length > 0) return `${outDir}/${files[0]!}`
      lastErr = new YtError('yt-dlp finished but produced no audio file.', 'download_failure')
    } catch (err: any) {
      lastErr = err
      // Try the next client; YouTube blocks some clients from datacenter IPs.
    }
  }

  const stderr: string = lastErr?.stderr || lastErr?.message || ''
  if (/unavailable|removed|private/i.test(stderr)) {
    throw new YtError('This video is unavailable.', 'video_unavailable')
  }
  throw new YtError('The audio could not be downloaded: ' + stderr.slice(0, 300), 'download_failure')
}
