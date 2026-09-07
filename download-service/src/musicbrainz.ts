/**
 * MusicBrainz fallback catalog for enrichment. Apple's iTunes catalog doesn't
 * carry every release — plenty of indie, self-released, or region-locked
 * tracks are on YouTube but missing from iTunes (e.g. Glass Animals' "Take a
 * Slice" on some stores). When the iTunes lookup comes up empty, the
 * enrichment layer falls back here for the canonical title/artist/album, the
 * track length (used to pick the real recording among duplicate uploads), and
 * cover art from the Cover Art Archive.
 *
 * MusicBrainz is a public service with strict etiquette: it requires a
 * descriptive User-Agent and asks for at most 1 request per second. Requests
 * are queued with a 1.2s spacing and cached per query, so a repeated search
 * never re-hits the API. The cover-art probe hits the Cover Art Archive — a
 * separate service built for hotlinking — so it is not throttled; it is a
 * cheap HEAD request that resolves the redirect to the real image URL (or a
 * 404), so the search UI never renders a broken image.
 *
 * MusicBrainz has no 30-second preview API, so previewUrl is always null
 * here, and trackId (the Apple id) is null too — dedupe and the song cache
 * fall back to the normalized title/artist as usual.
 */

const MB_SEARCH_BASE = 'https://musicbrainz.org/ws/2/recording'
const CAA_BASE = 'https://coverartarchive.org/release'
const SEARCH_TTL_MS = 12 * 60 * 60_000
/** MusicBrainz asks for ≤1 request/second; 1.2s leaves room for jitter. */
const MIN_INTERVAL_MS = 1_200
const USER_AGENT = 'DreamyPlayer/0.1 (https://github.com/Caportabow/Dreamy-Player)'

export interface MusicBrainzMatch {
  /** Canonical track title, per the MusicBrainz database. */
  title: string
  /** Canonical artist name (the credit as printed, e.g. "Glass Animals"). */
  artist: string
  /** Album the track appears on, when known. */
  album: string | null
  /** Cover art URL (Cover Art Archive), when the release has front art. */
  artworkUrl: string | null
  /** MusicBrainz has no preview clips — always null. */
  previewUrl: null
  /** No Apple id — always null (dedupe falls back to title/artist). */
  trackId: null
  /** Track length in milliseconds (MusicBrainz), when known. */
  trackTimeMillis: number | null
  source: 'musicbrainz'
}

/** Per-search budget: how many real MusicBrainz requests one search may
 * spend. MusicBrainz searches are slow (seconds each, serialized at ≤1 req/s),
 * so without a cap a page of iTunes-missing tracks turns enrichment into
 * minutes of waiting. The budget is shared across a search's songs and only
 * counts actual network requests — cache hits are free. Download-time lookups
 * (which don't pass a budget) are unlimited. */
export interface MusicBrainzBudget {
  remaining: number
}

/** Raw API responses cached by query, so re-scoring never re-hits the API. */
const cache = new Map<string, { at: number; data: any | null }>()
/** Resolved cover-art URLs per release id — the archive URLs are stable. */
const artworkCache = new Map<string, { at: number; url: string | null }>()

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
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      // Broad queries can take ~10s on MusicBrainz's shared search servers;
      // give them headroom so a slow-but-successful response isn't mistaken
      // for a failure — but a struggling MusicBrainz must not stall a search
      // for 20s per query (search time is budgeted, per-query latency isn't).
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** MusicBrainz queries use Lucene syntax; quote phrase values and escape them. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function norm(value: string): string {
  // Strip diacritics too, so "Beyonce" matches a query artist written
  // "Beyoncé" — same folding as the iTunes matcher.
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The artist credit as printed ("Glass Animals feat. Dave"). */
function creditName(recording: any): string {
  const credit = Array.isArray(recording?.['artist-credit']) ? recording['artist-credit'] : []
  let out = ''
  for (const part of credit) {
    if (typeof part?.name === 'string') out += part.name
    if (typeof part?.joinphrase === 'string') out += part.joinphrase
  }
  return out.trim()
}

/** Prefer official studio albums over live, compilation, remix, or bootleg
 * releases — MusicBrainz search ranks live bootlegs highly, and a studio
 * album should always win over one. */
function releaseScore(release: any): number {
  const group = release?.['release-group'] ?? {}
  const secondary: string[] = Array.isArray(group?.['secondary-types'])
    ? group['secondary-types']
    : []
  let score = 0
  if (String(group?.['primary-type'] ?? '') === 'Album') score += 2
  if (String(release?.status ?? '') === 'Official') score += 1
  if (String(release?.status ?? '') === 'Bootleg') score -= 2
  if (secondary.some((t) => ['Live', 'Compilation', 'DJ-mix', 'Remix', 'Demo'].includes(t))) {
    score -= 1
  }
  return score
}

function pickRelease(recording: any): any | null {
  let best: any = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const release of Array.isArray(recording?.releases) ? recording.releases : []) {
    const score = releaseScore(release)
    if (score > bestScore) {
      bestScore = score
      best = release
    }
  }
  return best
}

function pickBest(
  data: any,
  wantedTitle: string,
  wantedArtist: string | null,
  swap: boolean,
): (MusicBrainzMatch & { releaseId: string | null }) | null {
  const recordings = Array.isArray(data?.recordings) ? data.recordings : []
  if (recordings.length === 0) return null

  // Reversed uploads write "Title - Artist"; when the query is swapped the
  // expectations cross — the result's artist must look like the query's title
  // side and its title like the query's artist side.
  const wanted = norm(swap ? (wantedArtist ?? '') : wantedTitle)
  const artist = norm(swap ? wantedTitle : (wantedArtist ?? ''))

  let best: any = null
  let bestScore = -1
  let bestTitleScore = 0
  let bestArtistScore = 0
  for (const recording of recordings) {
    const title = norm(String(recording?.title ?? ''))
    const resultArtist = norm(creditName(recording))
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
    const release = pickRelease(recording)
    // Tie-break among equally good title/artist/release matches by how widely
    // the recording is released: the canonical version of a song appears on
    // many releases, a same-named cover on few. Capped low enough that it can
    // never override an exact artist match.
    const releases = Array.isArray(recording?.releases) ? recording.releases : []
    const releaseCount = Math.min(releases.length, 2)
    const score = titleScore + artistScore + (release ? releaseScore(release) : 0) + releaseCount
    if (score > bestScore) {
      bestScore = score
      bestTitleScore = titleScore
      bestArtistScore = artistScore
      best = recording
    }
  }

  // Same trust rules as the iTunes matcher: the title must overlap, and when
  // the query named an artist the result doesn't share, it's a different
  // recording of the same-named song — not a match.
  if (!best || bestTitleScore === 0) return null
  if (artist && bestArtistScore === 0) return null

  const release = pickRelease(best)
  // A bootleg's "album" is a bootleg title ("1993-11-18: R.I.P.: Sony
  // Studios (Unplugged), New York City, NY, USA") — wrong-looking metadata
  // that would end up in ID3 tags. The title/artist are still the real song;
  // the album is just withheld.
  const album = release && String(release.status ?? '') !== 'Bootleg' && release.title
    ? String(release.title)
    : null
  return {
    title: String(best.title ?? wantedTitle),
    artist: creditName(best) || wantedArtist || '',
    album,
    artworkUrl: null, // probed separately — a network call, not throttled
    previewUrl: null,
    trackId: null,
    trackTimeMillis: Number.isFinite(Number(best.length)) ? Number(best.length) : null,
    source: 'musicbrainz',
    releaseId: release?.id ? String(release.id) : null,
  }
}

/**
 * Resolve the Cover Art Archive's front-cover redirect to the real image URL,
 * or null when the release has no front art (404). Probed with a cheap HEAD
 * request so the search UI never renders a broken image, and cached — archive
 * URLs are stable, so a release is probed once.
 */
async function coverArtUrl(releaseId: string): Promise<string | null> {
  const hit = artworkCache.get(releaseId)
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.url
  let url: string | null = null
  try {
    const res = await fetch(`${CAA_BASE}/${releaseId}/front-500`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8_000),
    })
    if (res.ok) url = res.url
  } catch {
    url = null
  }
  artworkCache.set(releaseId, { at: Date.now(), url })
  if (artworkCache.size > 500) prune(artworkCache, SEARCH_TTL_MS)
  return url
}

/** One lookup: fetch (or reuse) the search response, score it, then probe the
 * cover archive for the winning release's front art. */
async function searchTerm(
  title: string,
  artist: string | null,
  swap: boolean,
  budget?: MusicBrainzBudget,
): Promise<MusicBrainzMatch | null> {
  const recordingTerm = (swap ? artist ?? title : title).trim()
  const artistTerm = (swap ? title : artist ?? '').trim()
  if (!recordingTerm) return null
  const query = artistTerm
    ? `recording:${quote(recordingTerm)} AND artist:${quote(artistTerm)}`
    : `recording:${quote(recordingTerm)}`
  // Ten results give the scoring a chance to find the canonical recording:
  // MusicBrainz's own relevance ranking can bury it under live bootlegs and
  // same-named covers, and its ordering isn't stable across calls.
  const params = new URLSearchParams({ query, fmt: 'json', limit: '10' })
  const cacheKey = params.toString()

  const hit = cache.get(cacheKey)
  let data: any | null = null
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) {
    data = hit.data
  } else {
    // The per-search budget gates the actual network requests here. When it
    // is spent, the lookup gives up quietly — the result stays unmatched
    // (clean title/artist, no catalog art) rather than stalling the search.
    const take = (): boolean => {
      if (!budget) return true
      if (budget.remaining <= 0) return false
      budget.remaining--
      return true
    }
    if (!take()) return null
    // MusicBrainz is a shared public service — its rate limiter occasionally
    // 503s even within the documented pace. One retry (with a pause) makes
    // the fallback resilient without hammering the API.
    data = await throttled(() => getJson(`${MB_SEARCH_BASE}?${params}`))
    if (!data && take()) {
      await sleep(1_500)
      data = await throttled(() => getJson(`${MB_SEARCH_BASE}?${params}`))
    }
    cache.set(cacheKey, { at: Date.now(), data })
    if (cache.size > 500) prune(cache, SEARCH_TTL_MS)
  }

  const picked = data ? pickBest(data, title, artist, swap) : null
  if (!picked) return null
  const { releaseId, ...match } = picked
  if (releaseId) match.artworkUrl = await coverArtUrl(releaseId)
  return match
}

/**
 * Find the canonical MusicBrainz entry for a (title, artist) pair. Pass
 * `swap` for reversed "Title - Artist" uploads — the pair is interpreted as
 * (artist, title), both in the query and in the scoring. Returns null when
 * MusicBrainz has no convincing match or is unreachable.
 */
export async function searchMusicBrainz(
  title: string,
  artist: string | null,
  swap = false,
  budget?: MusicBrainzBudget,
): Promise<MusicBrainzMatch | null> {
  return searchTerm(title, artist, swap, budget)
}

function prune(map: Map<string, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
