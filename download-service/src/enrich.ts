/**
 * Search-result enrichment: takes the raw YouTube results and, for the top few,
 *  - normalizes title/artist via MusicBrainz (also used to collapse duplicate
 *    uploads of the same recording in the results list),
 *  - resolves the real cover art from the Cover Art Archive (shown in the
 *    result cards and reused as the download artwork), and
 *  - finds an iTunes preview so the user can listen before downloading.
 *
 * Everything is best-effort: if an external service fails, results are shown
 * with their raw YouTube metadata and thumbnails.
 */

import { getCoverArtUrl, searchRecording, type RecordingMatch } from './musicbrainz'
import { searchPreview } from './itunes'
import type { VideoInfo } from './yt'

export interface EnrichedResult extends VideoInfo {
  /** Normalized album (MusicBrainz), when a match was found. */
  album: string | null
  /** Real cover art (Cover Art Archive), when one was found. */
  artworkUrl: string | null
  /** Short preview (Apple iTunes), when one was found. */
  previewUrl: string | null
  /** MusicBrainz recording id — stable key used to dedupe the results. */
  mbid: string | null
  /** Whether MusicBrainz had a match (title/artist are canonical when true). */
  matched: boolean
}

export interface Enrichment {
  title: string
  artist: string
  album: string | null
  mbid: string | null
  releaseIds: string[]
}

const ENRICH_LIMIT = 5
const ENRICH_TTL_MS = 30 * 60_000

const enrichCache = new Map<string, { at: number; enrichment: Enrichment | null }>()

/** Fast path: reuse enrichment produced during the search that found this URL. */
export function getEnrichment(url: string): Enrichment | null {
  const hit = enrichCache.get(url)
  if (hit && Date.now() - hit.at < ENRICH_TTL_MS) return hit.enrichment
  return null
}

const JUNK_MARKERS = /lyrics|official\s+(music\s+)?(video|audio)|hd|4k|1080p|60fps|audio|video/i

/** Strip the usual YouTube title furniture ("(Official Video)", "Lyrics", …). */
function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*\[[^\]]*\]/g, ' ')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(new RegExp(`\\s+(${JUNK_MARKERS.source})\\s*$`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clean a channel name into a likely artist name ("TaylorSwiftVEVO" → "Taylor Swift"). */
function cleanChannelArtist(channel: string): string {
  return channel
    .replace(/\s*(VEVO|Official|Music|Topic)\s*$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
}

/**
 * Guess the actual song/artist from a YouTube video. Most music uploads are
 * titled "Artist - Title"; auto-generated "Artist - Topic" channels carry only
 * the song title, with the artist in the channel name.
 */
export function guessArtistTitle(video: VideoInfo): { title: string; artist: string | null } {
  const cleaned = cleanTitle(video.title)

  const split = cleaned.split(/\s+[-–—|·•]\s+/)
  if (split.length >= 2) {
    const left = split[0]!.trim()
    const right = split.slice(1).join(' - ').trim()
    if (left && right && !/topic$/i.test(right)) {
      return { title: right, artist: left }
    }
  }

  const channel = (video.artist || '').trim()
  const topicMatch = channel.match(/^(.+?)\s*[-–—]\s*Topic$/i)
  if (topicMatch && topicMatch[1]?.trim()) {
    return { title: cleaned || video.title, artist: cleanChannelArtist(topicMatch[1]) }
  }

  return { title: cleaned || video.title, artist: cleanChannelArtist(channel) || null }
}

/** Prefer yt-dlp's own track/artist fields when the full metadata has them. */
function guessFromRaw(
  raw: any,
  video: VideoInfo,
): { title: string; artist: string | null } {
  const track = typeof raw?.track === 'string' ? raw.track.trim() : ''
  const artist = typeof raw?.artist === 'string' ? raw.artist.trim() : ''
  if (track) return { title: track, artist: artist || null }
  return guessArtistTitle(video)
}

/** Cache-or-fresh MusicBrainz normalization for one video. */
async function resolveEnrichment(
  video: VideoInfo,
  raw?: any,
): Promise<Enrichment | null> {
  const cached = getEnrichment(video.url)
  if (cached !== null || enrichCache.has(video.url)) return cached

  const guess = raw ? guessFromRaw(raw, video) : guessArtistTitle(video)
  const match: RecordingMatch | null = await searchRecording(guess.title, guess.artist)
  const enrichment: Enrichment | null = match
    ? {
        title: match.title,
        artist: match.artist,
        album: match.album,
        mbid: match.recordingId || null,
        releaseIds: match.releaseIds,
      }
    : null

  enrichCache.set(video.url, { at: Date.now(), enrichment })
  if (enrichCache.size > 1000) prune(enrichCache, ENRICH_TTL_MS)
  return enrichment
}

/**
 * Normalize the top results, resolve their real cover art, and attach
 * previews. MusicBrainz and Cover Art Archive each have their own 1 req/s
 * lane, so as soon as a recording is matched its cover lookup starts in
 * parallel; iTunes runs on its own faster lane alongside both.
 */
export async function enrichResults(results: VideoInfo[]): Promise<EnrichedResult[]> {
  const candidates = results.slice(0, ENRICH_LIMIT)
  if (candidates.length === 0) return []

  const normalizations = new Map<string, Enrichment | null>()
  const covers = new Map<string, string | null>()
  const previews = new Map<string, string | null>()

  await Promise.all([
    (async () => {
      // Lane 1: MusicBrainz normalization (serial, 1 req/s), firing each
      // cover lookup the moment its recording match arrives (Lane 2, CAA).
      const coverJobs: Promise<void>[] = []
      for (const video of candidates) {
        const enrichment = await resolveEnrichment(video)
        normalizations.set(video.url, enrichment)
        if (enrichment && enrichment.releaseIds.length > 0) {
          const url = video.url
          coverJobs.push(
            getCoverArtUrl(enrichment.releaseIds[0]!).then((coverUrl) => {
              covers.set(url, coverUrl)
            }),
          )
        }
      }
      await Promise.all(coverJobs)
    })(),
    (async () => {
      // Lane 3: iTunes previews (own faster lane).
      for (const video of candidates) {
        const guess = guessArtistTitle(video)
        const preview = await searchPreview(guess.title, guess.artist)
        previews.set(video.url, preview?.previewUrl ?? null)
      }
    })(),
  ])

  const enriched: EnrichedResult[] = candidates.map((video) => {
    const normalization = normalizations.get(video.url) ?? null
    return {
      ...video,
      title: normalization?.title || video.title,
      artist: normalization?.artist || video.artist,
      album: normalization?.album ?? null,
      artworkUrl: covers.get(video.url) ?? null,
      previewUrl: previews.get(video.url) ?? null,
      mbid: normalization?.mbid ?? null,
      matched: normalization !== null,
    }
  })

  // Collapse duplicate uploads of the same recording into a single result.
  // MusicBrainz gives a stable key; fall back to normalized title + artist.
  const seen = new Set<string>()
  const unique: EnrichedResult[] = []
  for (const result of enriched) {
    const key = result.mbid ?? normalizeKey(result.artist, result.title)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(result)
  }
  return unique
}

/** Re-normalize a video at download time (cache or fresh MusicBrainz lookup). */
export async function resolveEnrichmentForDownload(
  video: VideoInfo,
  raw?: any,
): Promise<Enrichment | null> {
  return resolveEnrichment(video, raw)
}

function normalizeKey(artist: string, title: string): string {
  const norm = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${norm(artist)} - ${norm(title)}`
}

function prune(map: Map<string, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
