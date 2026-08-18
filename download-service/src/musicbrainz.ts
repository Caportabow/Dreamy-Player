/**
 * MusicBrainz (recording search) + Cover Art Archive (cover art) client.
 *
 * MusicBrainz policy requires a descriptive User-Agent and at most one request
 * per second; Cover Art Archive sits on the same infrastructure, so both share
 * a single throttled queue. Every lookup here is best-effort — enrichment must
 * never block or fail a search or download when these services are slow,
 * overloaded (503), or unreachable.
 */

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
const COVER_ART_BASE = 'https://coverartarchive.org'

// Identify the app politely (MusicBrainz asks for app name, version, and a
// contact). Swap in a real contact address before deploying publicly.
const USER_AGENT = 'Dreamy/0.1.0 (self-hosted music app; +https://example.com/)'

/** MusicBrainz: 1 req/s plus a little margin. */
const REQUEST_INTERVAL_MS = 1_100
const SEARCH_TTL_MS = 6 * 60 * 60_000
const COVER_TTL_MS = 6 * 60 * 60_000

export interface RecordingMatch {
  /** Canonical recording title, per MusicBrainz. */
  title: string
  /** Canonical artist credit, per MusicBrainz. */
  artist: string
  /** Best-guess album (official release), when one is known. */
  album: string | null
  /** MusicBrainz recording id — stable key for duplicate detection. */
  recordingId: string
  /** Candidate release ids; cover art is looked up from these. */
  releaseIds: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** A promise chain that spaces outbound requests at least `intervalMs` apart. */
function makeThrottle(intervalMs: number) {
  let lastRequestAt = 0
  let queue: Promise<unknown> = Promise.resolve()
  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = Math.max(0, intervalMs - (Date.now() - lastRequestAt))
      if (wait > 0) await sleep(wait)
      lastRequestAt = Date.now()
      return fn()
    }
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }
}

// MusicBrainz and Cover Art Archive each allow ~1 req/s. They run on separate
// queues so a cover lookup never has to wait behind a recording search (and
// vice versa) — the two services can safely work in parallel.
const mbThrottle = makeThrottle(REQUEST_INTERVAL_MS)
const caaThrottle = makeThrottle(REQUEST_INTERVAL_MS)

async function getJson(url: string, timeoutMs = 8_000): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status === 404) return null
    if (!res.ok) return null // 503 overload, 429, etc. — enrichment is best-effort.
    return await res.json()
  } catch {
    return null
  }
}

const mbGet = (url: string): Promise<any | null> => mbThrottle(() => getJson(url))
const caaGet = (url: string): Promise<any | null> => caaThrottle(() => getJson(url))

function cleanSearchTerm(term: string): string {
  return term.replace(/"/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function artistCreditName(recording: any): string {
  const credit = Array.isArray(recording?.['artist-credit']) ? recording['artist-credit'] : []
  if (credit.length > 0) {
    const name = credit
      .map((entry: any) => `${clean(entry?.name)}${clean(entry?.joinphrase)}`)
      .join('')
      .trim()
    if (name) return name
  }
  const artists = Array.isArray(recording?.artists) ? recording.artists : []
  const first = artists[0]
  if (first && clean(first.name)) return clean(first.name)
  return 'Unknown artist'
}

function pickAlbum(releases: any[]): string | null {
  const preferred = releases.find(
    (r) => r?.status === 'Official' && r?.['primary-type'] === 'Album',
  )
  const chosen = preferred ?? releases[0]
  return clean(chosen?.title) || null
}

function pickBestRecording(data: any): RecordingMatch | null {
  const recordings = Array.isArray(data?.recordings) ? data.recordings : []
  if (recordings.length === 0) return null
  const sorted = [...recordings].sort(
    (a, b) => Number(b?.score ?? 0) - Number(a?.score ?? 0),
  )
  for (const recording of sorted) {
    const title = clean(recording?.title)
    if (!title) continue
    const releases: any[] = Array.isArray(recording?.releases) ? recording.releases : []
    // Releases are only used for cover art, so their absence must not prevent
    // the (still useful) title/artist normalization.
    const releaseIds = [
      ...new Set(
        releases
          .map((r: any) => (typeof r?.id === 'string' && r.id ? r.id : null))
          .filter((id: string | null): id is string => id !== null),
      ),
    ].slice(0, 5)
    return {
      title,
      artist: artistCreditName(recording),
      album: pickAlbum(releases),
      recordingId: String(recording.id ?? ''),
      releaseIds,
    }
  }
  return null
}

const searchCache = new Map<string, { at: number; match: RecordingMatch | null }>()

/**
 * Find the canonical recording for a (title, artist) pair. Returns null when
 * MusicBrainz has no convincing match or is unreachable.
 */
export async function searchRecording(
  title: string,
  artist: string | null,
): Promise<RecordingMatch | null> {
  const cleanedTitle = cleanSearchTerm(title)
  const cleanedArtist = artist ? cleanSearchTerm(artist) : ''
  if (!cleanedTitle) return null
  const cacheKey = `${cleanedArtist}\u0000${cleanedTitle}`.toLowerCase()

  const hit = searchCache.get(cacheKey)
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.match

  let query = `recording:"${cleanedTitle}"`
  if (cleanedArtist) query += ` AND artist:"${cleanedArtist}"`

  const params = new URLSearchParams({ query, fmt: 'json', limit: '5' })
  const data = await mbGet(`${MUSICBRAINZ_BASE}/recording?${params}`)
  const match = pickBestRecording(data)

  searchCache.set(cacheKey, { at: Date.now(), match })
  if (searchCache.size > 500) prune(searchCache, SEARCH_TTL_MS)
  return match
}

const coverCache = new Map<string, { at: number; url: string | null }>()

/** Resolve the front cover image URL for a release (null if it has no cover art). */
export async function getCoverArtUrl(releaseId: string): Promise<string | null> {
  const hit = coverCache.get(releaseId)
  if (hit && Date.now() - hit.at < COVER_TTL_MS) return hit.url

  const data = await caaGet(`${COVER_ART_BASE}/release/${releaseId}`)
  let url: string | null = null
  if (data) {
    const images = Array.isArray(data.images) ? data.images : []
    const front = images.find((img: any) => img?.front === true) ?? images[0]
    const thumbs = front?.thumbnails
    url =
      thumbs?.['500'] ??
      thumbs?.large ??
      thumbs?.['250'] ??
      thumbs?.small ??
      (typeof front?.image === 'string' ? front.image : null) ??
      null
  }

  coverCache.set(releaseId, { at: Date.now(), url })
  if (coverCache.size > 2000) prune(coverCache, COVER_TTL_MS)
  return url
}

/** Try several candidate releases until one yields cover art. */
export async function resolveCoverArt(releaseIds: string[]): Promise<string | null> {
  for (const releaseId of releaseIds.slice(0, 3)) {
    const url = await getCoverArtUrl(releaseId)
    if (url) return url
  }
  return null
}

function prune<K>(map: Map<K, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
