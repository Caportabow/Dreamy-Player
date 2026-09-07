/**
 * Deezer preview supplement. MusicBrainz has no audio previews, so tracks the
 * iTunes catalog doesn't carry (which is exactly when enrichment falls back to
 * MusicBrainz) used to show without a preview button. Deezer's free search API
 * returns a ~30s mp3 preview URL for most tracks — including indie tracks that
 * never made it to iTunes — which plays straight in the browser.
 *
 * Best-effort and cached per (title, artist) pair. A miss just means the
 * result shows without a preview button, as before. Deezer's limits are far
 * more generous than MusicBrainz's (roughly 50 requests / 5s), so lookups are
 * only lightly paced and are never budgeted — a search enriches at most a few
 * songs this way.
 */

const DEEZER_BASE = 'https://api.deezer.com/search'
const SEARCH_TTL_MS = 12 * 60 * 60_000
/** Gentle stagger so bursts of lookups don't pile onto the API at once. */
const MIN_INTERVAL_MS = 150

/** Raw preview URLs cached per (title, artist), so re-scoring never re-hits. */
const cache = new Map<string, { at: number; url: string | null }>()

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
  // Strip diacritics too, so "Beyonce" matches "Beyoncé" — same folding as
  // the other catalog matchers.
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Deezer's `q` syntax: phrase values are quoted; escape embedded quotes. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Find a preview for (title, artist). The artist is known from the catalog
 * match, so a result naming a *different* artist (a same-named cover) is
 * skipped — the preview must be for the song the user is looking at.
 */
export async function searchDeezerPreview(title: string, artist: string): Promise<string | null> {
  if (!title || !artist) return null
  const cacheKey = `${norm(title)} || ${norm(artist)}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.url

  const params = new URLSearchParams({ q: `track:${quote(title)} artist:${quote(artist)}`, limit: '5' })
  const data = await throttled(() => getJson(`${DEEZER_BASE}?${params}`))

  let url: string | null = null
  const wantedTitle = norm(title)
  const wantedArtist = norm(artist)
  if (data) {
    for (const track of Array.isArray(data.data) ? data.data : []) {
      const trackTitle = norm(String(track?.title ?? ''))
      const trackArtist = norm(String(track?.artist?.name ?? ''))
      const titleMatches = trackTitle === wantedTitle || trackTitle.includes(wantedTitle) || wantedTitle.includes(trackTitle)
      const artistMatches = trackArtist === wantedArtist || trackArtist.includes(wantedArtist) || wantedArtist.includes(trackArtist)
      if (titleMatches && artistMatches && typeof track?.preview === 'string' && track.preview) {
        url = track.preview
        break
      }
    }
  }

  cache.set(cacheKey, { at: Date.now(), url })
  if (cache.size > 500) prune(cache, SEARCH_TTL_MS)
  return url
}

function prune(map: Map<string, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
