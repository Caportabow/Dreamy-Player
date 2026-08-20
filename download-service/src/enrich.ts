/**
 * Search-result enrichment: takes the raw YouTube results and, for the top few,
 *  - normalizes title/artist against the iTunes catalog (also used to collapse
 *    duplicate uploads of the same song in the results list),
 *  - resolves the real cover art (iTunes artwork),
 *  - finds a 30-second preview so the user can listen before downloading.
 *
 * Variant uploads ("Song (slowed + reverb)", "Song (best part)", …) are handled
 * specially: the variant tags are stripped to locate the original track on
 * iTunes, the result keeps the tags in its name while adopting the original's
 * artist/artwork, and it stays an independent track (itunesId null) so it never
 * collapses with the original or with other variants.
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

const ENRICH_LIMIT = 10
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

/**
 * Audio-treatment / excerpt markers that make an upload a *variant* of a song
 * (slowed, sped up, reverb, "best part", …). Listed longest-first so combined
 * forms like "slowed + reverb" win over their parts.
 */
const VARIANT_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Combined forms first so they win over their parts.
  { label: 'slowed + reverb', re: /\bslowed\s*(?:down\s*)?(?:&|and|\+)\s*reverb\b/i },
  { label: 'slowed down', re: /\bslowed\s*down\b/i },
  { label: 'slowed', re: /\bslowed\b/i },
  { label: 'sped up', re: /\bsped\s*up\b/i },
  { label: 'speed up', re: /\bspeed\s*up\b/i },
  { label: 'reverb', re: /\breverb\b/i },
  { label: 'best part', re: /\bbest\s*part\b/i },
  { label: 'nightcore', re: /\bnightcore\b/i },
  { label: 'bass boosted', re: /\bbass\s*boost(?:ed)?\b|\bbassboosted\b/i },
  { label: 'tiktok version', re: /\tiktok\s*version\b/i },
  { label: '8d audio', re: /\b8d(?:\s*audio)?\b/i },
  { label: 'phonk', re: /\bphonk\b/i },
  { label: 'remix', re: /\bremix\b/i },
  { label: 'extended', re: /\bextended\b/i },
  { label: 'instrumental', re: /\binstrumental\b/i },
  { label: 'acoustic', re: /\bacoustic\b/i },
]

/** Variant markers present in a raw video title, in a sensible display order. */
function extractVariantTags(rawTitle: string): string[] {
  const found: string[] = []
  let rest = rawTitle
  for (const { label, re } of VARIANT_PATTERNS) {
    if (re.test(rest)) {
      found.push(label)
      rest = rest.replace(re, ' ')
    }
  }
  return found
}

/** Remove the variant tags from a cleaned title, leaving just the song name. */
function stripVariantTags(title: string, tags: string[]): string {
  let out = title
  for (const tag of tags) {
    const entry = VARIANT_PATTERNS.find((p) => p.label === tag)
    if (entry) out = out.replace(entry.re, ' ')
  }
  // Leftover connectors / decorative symbols trailing the song name are tag
  // residue ("&", "+", "♥"), not part of the song.
  return out
    .replace(/[♥♪♫❤]+/g, ' ')
    .replace(/\s*(?:&|\+|and)\s*$/i, '')
    .replace(/[-\s]+/g, ' ')
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
  const variantTags = extractVariantTags(video.title)

  // A variant upload ("Song (slowed + reverb)", "Song (best part)", …) is
  // matched against iTunes by its stripped song name, so the original's
  // artist/cover apply while the tags stay in the result's name. The variant
  // keeps itunesId null so it never collapses with the original song (or other
  // variants) in dedupe — it's its own independent track, and the original's
  // 30-second preview is not offered on edited versions.
  let match: ItunesMatch | null = null
  let isVariant = false
  if (variantTags.length > 0) {
    // Try the whole cleaned title with the tags stripped first — this is the
    // only reliable query for reversed titles like "something in the way -
    // nirvana (sped up)", which the "Artist - Title" parser would misread as
    // song="nirvana". Fall back to the parsed guess when that misses.
    const strippedRaw = stripVariantTags(cleanTitle(video.title), variantTags)
    const strippedGuess = stripVariantTags(guess.title, variantTags)
    const candidates = [...new Set([strippedRaw, strippedGuess])].filter((t) => t.length >= 2)
    // Search title-only — the uploader channel is usually a random remix
    // account, not the original artist.
    for (const term of candidates) {
      match = await searchMatch(term, null)
      if (match) {
        isVariant = true
        break
      }
    }
  }
  if (!match) {
    // Plain normalization. This also covers titles where the "tag" is
    // literally the song name (e.g. Daniel Caesar's "Best Part").
    match = await searchMatch(guess.title, guess.artist)
  }

  const enrichment: Enrichment | null = match
    ? {
        title: isVariant ? `${match.title} (${variantTags.join(' + ')})` : match.title,
        artist: match.artist,
        album: match.album,
        itunesId: isVariant ? null : match.trackId !== null ? String(match.trackId) : null,
        artworkUrl: match.artworkUrl,
        previewUrl: isVariant ? null : match.previewUrl,
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
