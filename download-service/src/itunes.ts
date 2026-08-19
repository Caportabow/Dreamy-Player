/**
 * Apple iTunes Search API client — the single source of enrichment for search
 * results and downloads. One lookup yields the canonical title/artist, album,
 * cover art, a ~30s audio preview, and a stable track id (used to collapse
 * duplicate uploads of the same song). Best-effort: a miss must never block a
 * search or download. Apple documents the Search API as "limited to
 * approximately 20 calls per minute (subject to change)" and recommends
 * caching; we stay safely below that with a 200ms burst stagger, a per-term
 * cache, and a rolling 60-second window capped at 15 calls.
 */

const ITUNES_BASE = 'https://itunes.apple.com/search'
const SEARCH_TTL_MS = 12 * 60 * 60_000
const MIN_INTERVAL_MS = 200
/** Apple's ceiling is ~20/min; never exceed 15 in any 60s window. */
const MAX_CALLS_PER_WINDOW = 15
const WINDOW_MS = 60_000

export interface ItunesMatch {
  /** Canonical track title, per the iTunes catalog. */
  title: string
  /** Canonical artist name, per the iTunes catalog. */
  artist: string
  /** Album the track appears on, when known. */
  album: string | null
  /** Large cover art URL (300×300), when available. */
  artworkUrl: string | null
  /** ~30s audio preview, when available. */
  previewUrl: string | null
  /** Apple track id — stable key for duplicate detection. */
  trackId: number | null
}

const cache = new Map<string, { at: number; match: ItunesMatch | null }>()

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let lastRequestAt = 0
const callTimestamps: number[] = []
let queue: Promise<unknown> = Promise.resolve()

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const now = Date.now()
    // Drop timestamps that have aged out of the window.
    while (callTimestamps.length > 0 && now - callTimestamps[0]! >= WINDOW_MS) {
      callTimestamps.shift()
    }
    // Budget exhausted for this minute — wait until the oldest call ages out
    // (one slot frees up). Only reachable under sustained heavy use.
    if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
      await sleep(WINDOW_MS - (now - callTimestamps[0]!) + 250)
    }
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    callTimestamps.push(Date.now())
    return fn()
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Apple serves artwork at the requested size via the URL suffix. */
function upscaleArtwork(url: string): string {
  return url.replace(/\/100x100bb\./, '/300x300bb.')
}

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function pickBest(data: any, wantedTitle: string, wantedArtist: string | null): ItunesMatch | null {
  const results = Array.isArray(data?.results) ? data.results : []
  if (results.length === 0) return null

  const wanted = norm(wantedTitle)
  const artist = wantedArtist ? norm(wantedArtist) : ''

  let best: any = null
  let bestScore = -1
  for (const result of results) {
    const title = norm(String(result?.trackName ?? ''))
    const resultArtist = norm(String(result?.artistName ?? ''))
    let score = 0
    if (wanted && title) {
      if (title === wanted) score += 4
      else if (title.includes(wanted) || wanted.includes(title)) score += 2
    }
    if (artist && resultArtist) {
      if (resultArtist === artist) score += 3
      else if (resultArtist.includes(artist) || artist.includes(resultArtist)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = result
    }
  }

  // A result must at least overlap in title to be worth trusting.
  if (!best || bestScore < 2) return null

  const artwork =
    typeof best.artworkUrl100 === 'string' && best.artworkUrl100
      ? upscaleArtwork(best.artworkUrl100)
      : null
  const previewUrl = typeof best.previewUrl === 'string' ? best.previewUrl : ''

  return {
    title: String(best.trackName ?? wantedTitle),
    artist: String(best.artistName ?? wantedArtist ?? ''),
    album:
      typeof best.collectionName === 'string' && best.collectionName
        ? best.collectionName
        : null,
    artworkUrl: artwork,
    previewUrl: previewUrl || null,
    trackId: Number.isFinite(Number(best.trackId)) ? Number(best.trackId) : null,
  }
}

/**
 * Find the canonical iTunes entry for a (title, artist) pair. Returns null
 * when Apple has no convincing match or is unreachable.
 */
export async function searchMatch(
  title: string,
  artist: string | null,
): Promise<ItunesMatch | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim().slice(0, 200)
  if (!term) return null
  const cacheKey = term.toLowerCase()

  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.match

  const params = new URLSearchParams({ term, entity: 'song', limit: '5', country: 'US' })
  const match = await throttled(async () => {
    const data = await getJson(`${ITUNES_BASE}?${params}`)
    return pickBest(data, title, artist)
  })

  cache.set(cacheKey, { at: Date.now(), match })
  if (cache.size > 500) prune(cache, SEARCH_TTL_MS)
  return match
}

function prune(map: Map<string, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
