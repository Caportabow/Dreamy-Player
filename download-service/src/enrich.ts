/**
 * Search-result enrichment: takes the raw YouTube results and, for the top few,
 *  - normalizes title/artist against the iTunes catalog (also used to collapse
 *    duplicate uploads of the same song in the results list),
 *  - resolves the real cover art (iTunes artwork),
 *  - finds a 30-second preview so the user can listen before downloading.
 *
 * Everything is best-effort: if iTunes fails, results are shown with their raw
 * YouTube metadata and thumbnails.
 */

import { searchMatch, type ItunesMatch } from './itunes'
import type { VideoInfo } from './yt'

export interface EnrichedResult extends VideoInfo {
  /** Normalized album (iTunes), when a match was found. */
  album: string | null
  /** Real cover art (iTunes), when one was found. */
  artworkUrl: string | null
  /** Short preview (Apple iTunes), when one was found. */
  previewUrl: string | null
  /** Apple track id — stable key used to dedupe the results. */
  itunesId: string | null
  /** Whether iTunes had a match (title/artist are canonical when true). */
  matched: boolean
}

export interface Enrichment {
  title: string
  artist: string
  album: string | null
  itunesId: string | null
  artworkUrl: string | null
  previewUrl: string | null
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

/** Clean a channel name into a likely artist name ("Official Arctic Monkeys" → "Arctic Monkeys", "TaylorSwiftVEVO" → "Taylor Swift"). */
function cleanChannelArtist(channel: string): string {
  return channel
    .replace(/^Official\s+/i, '')
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

/** Cache-or-fresh iTunes normalization for one video. */
async function resolveEnrichment(
  video: VideoInfo,
  raw?: any,
): Promise<Enrichment | null> {
  const cached = getEnrichment(video.url)
  if (cached !== null || enrichCache.has(video.url)) return cached

  const guess = raw ? guessFromRaw(raw, video) : guessArtistTitle(video)
  const match: ItunesMatch | null = await searchMatch(guess.title, guess.artist)
  const enrichment: Enrichment | null = match
    ? {
        title: match.title,
        artist: match.artist,
        album: match.album,
        itunesId: match.trackId !== null ? String(match.trackId) : null,
        artworkUrl: match.artworkUrl,
        previewUrl: match.previewUrl,
      }
    : null

  enrichCache.set(video.url, { at: Date.now(), enrichment })
  if (enrichCache.size > 1000) prune(enrichCache, ENRICH_TTL_MS)
  return enrichment
}

/**
 * Normalize the top results, attach cover art and previews, and collapse
 * duplicate uploads of the same song. A single serial lane is enough: iTunes
 * is fast and lightly throttled (200ms stagger), and one lookup supplies the
 * metadata, artwork, preview, and dedupe key at once.
 */
export async function enrichResults(results: VideoInfo[]): Promise<EnrichedResult[]> {
  const candidates = results.slice(0, ENRICH_LIMIT)
  if (candidates.length === 0) return []

  const enriched: EnrichedResult[] = []
  for (const video of candidates) {
    const normalization = await resolveEnrichment(video)
    enriched.push({
      ...video,
      title: normalization?.title || video.title,
      artist: normalization?.artist || video.artist,
      album: normalization?.album ?? null,
      artworkUrl: normalization?.artworkUrl ?? null,
      previewUrl: normalization?.previewUrl ?? null,
      itunesId: normalization?.itunesId ?? null,
      matched: normalization !== null,
    })
  }

  // Collapse duplicate uploads of the same song into a single result.
  // iTunes gives a stable key; fall back to normalized title + artist.
  const seen = new Set<string>()
  const unique: EnrichedResult[] = []
  for (const result of enriched) {
    const key = result.itunesId ?? normalizeKey(result.artist, result.title)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(result)
  }
  return unique
}

/** Re-normalize a video at download time (cache or fresh iTunes lookup). */
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
