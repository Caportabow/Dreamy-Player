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
  /** Track length in milliseconds (iTunes catalog) — the canonical audio
   * length, used to pick the real recording among duplicate uploads. */
  trackTimeMillis: number | null
  source: 'itunes'
}

/** Raw API responses cached by term, so forward and reversed-order scoring of
 * the same query share a single network call (the swap only re-scores). */
const cache = new Map<string, { at: number; data: any | null }>()

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
  // Strip diacritics too, so "Beyoncé" matches a query artist written
  // "Beyonce" — without this, the artist-mismatch guard below would reject
  // perfectly good matches purely on accent spelling.
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickBest(
  data: any,
  wantedTitle: string,
  wantedArtist: string | null,
  swap = false,
): ItunesMatch | null {
  const results = Array.isArray(data?.results) ? data.results : []
  if (results.length === 0) return null

  // Reversed uploads write "Title - Artist"; when the query is swapped the
  // expectations cross — the result's artist must look like the query's title
  // side and its title like the query's artist side.
  const wanted = norm(swap ? (wantedArtist ?? '') : wantedTitle)
  const artist = norm(swap ? wantedTitle : (wantedArtist ?? ''))

  let best: any = null
  let bestScore = -1
  let bestTitleScore = 0
  let bestArtistScore = 0
  for (const result of results) {
    const title = norm(String(result?.trackName ?? ''))
    const resultArtist = norm(String(result?.artistName ?? ''))
    let titleScore = 0
    if (wanted && title) {
      if (title === wanted) titleScore = 4
      else if (title.includes(wanted) || wanted.includes(title)) titleScore = 2
    }
    let artistScore = 0
    if (artist && resultArtist) {
      if (resultArtist === artist) artistScore = 3
      else if (resultArtist.includes(artist) || artist.includes(resultArtist)) artistScore = 1
    }
    const score = titleScore + artistScore
    if (score > bestScore) {
      bestScore = score
      bestTitleScore = titleScore
      bestArtistScore = artistScore
      best = result
    }
  }

  // A result must at least overlap in title to be worth trusting.
  if (!best || bestTitleScore === 0) return null
  // When the query named an artist the result doesn't share, the result is a
  // different recording of the same-named song — a cover, a cover band, or
  // someone else's track entirely (e.g. searching "Take a Slice" by Glass
  // Animals keeps matching an unrelated cover of the same name). Even an exact
  // title match can't override a total artist mismatch; the caller falls back
  // to a title-only retry where that is safe.
  if (artist && bestArtistScore === 0) return null

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
    trackTimeMillis: Number.isFinite(Number(best.trackTimeMillis))
      ? Number(best.trackTimeMillis)
      : null,
    source: 'itunes',
  }
}

/** One lookup: fetch (or reuse the cached response), then score it. */
async function searchTerm(
  title: string,
  artist: string | null,
  swap: boolean,
): Promise<ItunesMatch | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim().slice(0, 200)
  if (!term) return null
  const cacheKey = term.toLowerCase()

  const hit = cache.get(cacheKey)
  let data: any | null = null
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) {
    data = hit.data
  } else {
    const params = new URLSearchParams({ term, entity: 'song', limit: '5', country: 'US' })
    data = await throttled(async () => {
      const json = await getJson(`${ITUNES_BASE}?${params}`)
      return json ?? null
    })
    cache.set(cacheKey, { at: Date.now(), data })
    if (cache.size > 500) prune(cache, SEARCH_TTL_MS)
  }
  return data ? pickBest(data, title, artist, swap) : null
}

/**
 * Find the canonical iTunes entry for a (title, artist) pair. Returns null
 * when Apple has no convincing match or is unreachable.
 */
export async function searchMatch(
  title: string,
  artist: string | null,
): Promise<ItunesMatch | null> {
  return searchTerm(title, artist, false)
}

/**
 * Same query as `searchMatch`, but scored for reversed "Title - Artist"
 * uploads: the pair is interpreted as (artist, title). Shares the same term
 * and cached response, so it costs nothing when the forward search already
 * ran — only the scoring differs.
 */
export async function searchMatchSwapped(
  title: string,
  artist: string | null,
): Promise<ItunesMatch | null> {
  return searchTerm(title, artist, true)
}

function prune(map: Map<string, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
