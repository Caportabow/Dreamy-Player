/**
 * Apple iTunes Search API client — the single source of enrichment for search
 * results and downloads. One lookup yields the canonical title/artist, album,
 * cover art, a ~30s audio preview, and a stable track id (used to collapse
 * duplicate uploads of the same song). Best-effort: a miss must never block a
 * search or download. Apple documents the Search API as "limited to
 * approximately 20 calls per minute (subject to change)" and recommends
 * caching; we stay within that with a per-term cache, a 200ms burst stagger,
 * and a token bucket that lets a search's burst of lookups through at once
 * while pacing sustained load at ~20 calls/min.
 */

const ITUNES_BASE = 'https://itunes.apple.com/search'
const SEARCH_TTL_MS = 12 * 60 * 60_000
const MIN_INTERVAL_MS = 200
/**
 * Apple's ceiling is ~20 calls/min. A token bucket allows a burst of that
 * size (one search enriches up to ~10–20 results) to complete in seconds;
 * the previous sliding 15-per-minute window stalled ~60s per call once a
 * burst hit the ceiling, turning enrichment into minutes of waiting.
 */
const BURST = 20
const REFILL_MS = 3_000 // one token per 3s ≈ 20 calls/min

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

let tokens = BURST
let lastRefill = Date.now()
let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const now = Date.now()
    tokens = Math.min(BURST, tokens + (now - lastRefill) / REFILL_MS)
    lastRefill = now
    if (tokens < 1) {
      // Budget exhausted — wait for the next token instead of stalling a full
      // minute per call (the old window behavior).
      const wait = Math.ceil((1 - tokens) * REFILL_MS)
      await sleep(wait + 50)
      tokens = Math.min(BURST, tokens + (wait + 50) / REFILL_MS)
      lastRefill = Date.now()
    }
    tokens -= 1
    // Keep a gentle stagger between actual network calls even inside a burst.
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
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
