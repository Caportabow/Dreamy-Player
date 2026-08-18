/**
 * Apple iTunes Search API client — used to offer a short (~30s) audio preview
 * of a track before it is downloaded. Best-effort: a missing preview must
 * never block a search. iTunes calls run on their own (faster) lane because
 * they are not subject to the MusicBrainz 1 req/s rule; Apple allows roughly
 * 20 calls/minute, and we stay well below that with a small stagger.
 */

const ITUNES_BASE = 'https://itunes.apple.com/search'
const SEARCH_TTL_MS = 12 * 60 * 60_000
const MIN_INTERVAL_MS = 200

export interface ItunesPreview {
  previewUrl: string
  trackName: string
  artistName: string
  album: string | null
}

const cache = new Map<string, { at: number; match: ItunesPreview | null }>()

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
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

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function pickBest(data: any, wantedTitle: string, wantedArtist: string | null): ItunesPreview | null {
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

  // A result must at least overlap in title to be worth previewing.
  if (!best || bestScore < 2) return null
  const previewUrl = typeof best.previewUrl === 'string' ? best.previewUrl : ''
  if (!previewUrl) return null

  return {
    previewUrl,
    trackName: String(best.trackName ?? wantedTitle),
    artistName: String(best.artistName ?? wantedArtist ?? ''),
    album: typeof best.collectionName === 'string' && best.collectionName ? best.collectionName : null,
  }
}

/**
 * Look up a 30-second preview for a (title, artist) pair. Returns null when
 * iTunes has no matching song or is unreachable.
 */
export async function searchPreview(
  title: string,
  artist: string | null,
): Promise<ItunesPreview | null> {
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
