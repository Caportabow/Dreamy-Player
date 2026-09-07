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
 * Titles are messy on purpose — stylized fonts ("𝙢𝙤𝙡𝙞𝙣𝙖"), reversed
 * "Title - Artist" order, "Song by Artist" phrasing, decorative separators.
 * Enrichment normalizes all of them before querying the catalogs (see
 * `fancy.ts` and `guessArtistTitle`), and an unmatched result still gets the
 * cleanest title/artist the title itself allows.
 *
 * Two catalogs back the enrichment: Apple iTunes first (it carries the 30s
 * preview and the stable track id), then MusicBrainz for tracks the iTunes
 * catalog doesn't have (cover art comes from the Cover Art Archive). Because
 * MusicBrainz carries no audio, tracks it matches borrow a ~30s preview from
 * Deezer's free API, so previews stay available for songs the iTunes catalog
 * lacks. See `itunes.ts`, `musicbrainz.ts`, and `deezer.ts`.
 *
 * MusicBrainz searches are slow and serialized (≤1 request/second), so one
 * search gets a shared budget of actual MusicBrainz queries — when it's
 * spent, remaining songs stay unmatched (clean title/artist, no catalog art)
 * instead of stalling the page.
 *
 * Variants and uploads on random remix/lyrics channels carry no artist signal
 * of their own, so their title-only lookup can land on a same-named cover
 * (ByAstral's "Take a Slice" for Glass Animals'). Once the canonical song is
 * known — from the same search or a previous one — those results are
 * re-attributed to it for free via a title-only index (no extra lookup), so
 * the cover never wins and the artist is right without paying a MusicBrainz
 * query per variant.
 *
 * Enrichments are cached twice: by video URL (repeat visits of the same
 * upload) and by normalized song (different uploads or queries of the same
 * track reuse the catalog result without a fresh lookup).
 *
 * Everything is best-effort: if both catalogs fail, results are shown with
 * their raw YouTube metadata and thumbnails.
 */

import { searchMatch, searchMatchSwapped, type ItunesMatch } from './itunes'
import {
  searchMusicBrainz,
  type MusicBrainzBudget,
  type MusicBrainzMatch,
} from './musicbrainz'
import { searchDeezerPreview } from './deezer'
import { normalizeFancy } from './fancy'
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
  /** Track length in milliseconds (catalog) — the canonical audio length
   * used to pick the real recording among duplicate uploads. */
  trackTimeMillis: number | null
  /** Whether the catalogs had a match (title/artist are canonical when true). */
  matched: boolean
  /** Which catalog matched (null when unmatched). */
  source: 'itunes' | 'musicbrainz' | null
}

export interface Enrichment {
  title: string
  artist: string
  album: string | null
  itunesId: string | null
  artworkUrl: string | null
  previewUrl: string | null
  /** Track length in milliseconds (catalog); null when unknown. */
  trackTimeMillis: number | null
  /** Which catalog the normalization came from. */
  source: 'itunes' | 'musicbrainz'
}

const ENRICH_LIMIT = 10
const ENRICH_TTL_MS = 30 * 60_000
/** How many real MusicBrainz queries one search may spend (shared across its
 * songs). Each costs ~1.2s of rate-limit spacing plus seconds of server time,
 * so an unbounded fallback turns a page of iTunes-missing tracks into minutes
 * of waiting. Cache hits and download-time lookups don't count against it. */
const MB_BUDGET_PER_SEARCH = 3
/** Canonical iTunes data barely changes, so a matched song stays reusable much
 * longer than a video URL — this is what saves lookups on repeat searches. */
const SONG_CACHE_TTL_MS = 12 * 60 * 60_000

const enrichCache = new Map<string, { at: number; enrichment: Enrichment | null }>()
/**
 * Song-level cache: normalized "artist - title" → enrichment. YouTube serves
 * the same track many times (official upload, Topic channel, re-uploads), and
 * differently-phrased queries keep finding those uploads — once a song has
 * been matched, every later upload or query of it reuses the canonical
 * name/artist/art/preview instead of asking iTunes again.
 */
const songCache = new Map<string, { at: number; enrichment: Enrichment | null }>()
/**
 * Title-only cache: normalized song title → canonical enrichment. Variants
 * ("Song (slowed)") and uploads on random remix/lyrics channels carry no
 * artist signal of their own, so their title-only catalog lookup can land on
 * a same-named cover (e.g. ByAstral's "Take a Slice" for Glass Animals').
 * Once the canonical song has been matched, its artist/album/artwork can be
 * reused for those uploads for free — no extra (slow, budgeted) MusicBrainz
 * query. Garbage-channel matches are not cached here: a cover must not become
 * the canonical "title".
 */
const titleCache = new Map<string, { at: number; enrichment: Enrichment }>()

/** Fast path: reuse enrichment produced during the search that found this URL. */
export function getEnrichment(url: string): Enrichment | null {
  const hit = enrichCache.get(url)
  if (hit && Date.now() - hit.at < ENRICH_TTL_MS) return hit.enrichment
  return null
}

const JUNK_MARKERS = /lyrics|official\s+(music\s+)?(video|audio)|hd|4k|1080p|60fps|audio|video/i

/** Strip the usual YouTube title furniture ("(Official Video)", "Lyrics", …). */
function cleanTitle(rawTitle: string): string {
  return normalizeFancy(rawTitle)
    .replace(/\s*\|\|.*$/, ' ')
    .replace(/\s*\[[^\]]*\]/g, ' ')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(new RegExp(`\\s+(${JUNK_MARKERS.source})\\s*$`, 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Audio-treatment / excerpt markers that make an upload a *variant* of a song
 * (slowed, sped up, reverb, "best part", intro edits, …). Listed longest-first
 * so combined forms like "slowed + reverb" win over their parts.
 */
const VARIANT_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // Combined forms first so they win over their parts.
  { label: 'looped', re: /\bslooped\b/i },
  { label: 'slowed + reverb', re: /\bslowed\s*(?:down\s*)?(?:&|and|\+)\s*reverb\b/i },
  { label: 'slowed down', re: /\bslowed\s*down\b/i },
  { label: 'slowed', re: /\bslowed\b/i },
  { label: 'sped up', re: /\bsped\s*up\b/i },
  { label: 'speed up', re: /\bspeed\s*up\b/i },
  { label: 'reverb', re: /\breverb\b/i },
  { label: 'best part', re: /\bbest\s*part\b/i },
  { label: 'without intro', re: /\bwithout\s+(?:the\s+)?(?:intro|outro)\b/i },
  { label: 'no intro', re: /\bno\s+(?:intro|outro)\b/i },
  { label: 'nightcore', re: /\bnightcore\b/i },
  { label: 'bass boosted', re: /\bbass\s*boost(?:ed)?\b|\bbassboosted\b/i },
  { label: 'tiktok version', re: /\btiktok\s*version\b/i },
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
  let rest = normalizeFancy(rawTitle)
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
  // residue (" | slowed", "& reverb", "⋄", "♥"), not part of the song. The
  // interior "&"/"+"/ "and" are kept — they can be part of the real name
  // ("Death & Glory").
  return out
    .replace(/[♥♪♫❤]+/g, ' ')
    .replace(/[\s|·•⋄◇◆&+\-]+$/g, '')
    .replace(/\s*(?:&|\+|and)\s*$/i, '')
    .replace(/[|·•⋄◇◆]+/g, ' ')
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

/** Topic, VEVO, and "Official …" channels are the artist's own channels —
 * their name is an authoritative artist claim. Random remix/lyrics accounts
 * ("vibes only", "Lyrics Realm") are not. */
function channelLooksAuthoritative(channel: string): boolean {
  const c = channel.trim()
  return /topic$/i.test(c) || /vevo$/i.test(c) || /^official\b/i.test(c)
}

/** Random remix/lyrics/cover accounts name themselves after what they post,
 * not after the artist — their name is noise, not an artist claim. Keyword-
 * based, deliberately conservative: a channel that matches none of these is
 * treated as claiming its name is the artist's. */
function channelLooksGarbage(channel: string): boolean {
  const c = channel.trim().toLowerCase()
  return /\b(lyrics?|remix|slowed|reverb|nightcore|sped ?up|speed ?up|phonk|bass ?boost|boosted|vibes|beats?|mash ??up|mix|cover|karaoke|tribute|instrumental|piano|guitar|violin|sax|flute|lofi|lo-?fi|chill|ambient|8d|edits?|dj)\b/i.test(c)
}

/** Do two artist names plausibly refer to the same artist (accent-insensitive)? */
function artistsAgree(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const na = norm(a)
  const nb = norm(b)
  return (
    na !== '' &&
    nb !== '' &&
    (na === nb || na.includes(nb) || nb.includes(na))
  )
}

export interface TitleGuess {
  title: string
  artist: string | null
  /** Where the artist came from — decides how much to trust it in queries. */
  artistSource: 'title-by' | 'title-split' | 'channel' | null
  /** Whether the uploader's channel looks like the artist's own channel
   * (Topic, VEVO, "Official …") — its artist claim is then trustworthy
   * enough that a catalog result naming a different artist is a same-named
   * cover, not the song being searched. */
  channelStrong: boolean
  /** Whether the channel name is a random remix/lyrics account (noise) rather
   * than an artist claim — see `channelLooksGarbage`. */
  channelGarbage: boolean
}

/**
 * Guess the actual song/artist from a YouTube video. Most music uploads are
 * titled "Artist - Title"; auto-generated "Artist - Topic" channels carry only
 * the song title, with the artist in the channel name. Also handles the messy
 * real-world cases: reversed "Title - Artist" order (disambiguated by the
 * channel when possible), "Song by Artist" phrasing, and decorative
 * separators ("molina ⋄ hey kids | slowed").
 */
export function guessArtistTitle(video: VideoInfo): TitleGuess {
  const cleaned = cleanTitle(video.title)
  const channel = (video.artist || '').trim()
  const channelStrong = channelLooksAuthoritative(channel)
  const channelGarbage = channelLooksGarbage(channel)
  // Pull the artist out of "Artist - Topic" channels before cleaning, so the
  // comparison below sees "Molina" rather than "Molina -".
  const topicMatch = channel.match(/^(.+?)\s*[-–—]\s*Topic$/i)
  const channelArtist = cleanChannelArtist(topicMatch ? topicMatch[1]! : channel)

  const split = cleaned.split(/\s+[-–—|·•⋄◇◆]\s+/)
  if (split.length >= 2) {
    const left = split[0]!.trim()
    const right = split.slice(1).join(' - ').trim()
    if (left && right && !/topic$/i.test(right)) {
      // "Artist - Title" is the norm, but many uploads write it backwards
      // ("Hey Kids - Molina"). When one side matches the channel name, that
      // side is the artist — Topic and official channels name the artist.
      if (channelArtist) {
        const normSide = (s: string): string => s.toLowerCase().trim()
        if (normSide(left) === normSide(channelArtist)) {
          return { title: right, artist: left, artistSource: 'title-split', channelStrong, channelGarbage }
        }
        if (normSide(right) === normSide(channelArtist)) {
          return { title: left, artist: right, artistSource: 'title-split', channelStrong, channelGarbage }
        }
      }
      return { title: right, artist: left, artistSource: 'title-split', channelStrong, channelGarbage }
    }
  }

  // "Song by Artist" uploads ("Take a Slice by Glass Animals") carry the
  // artist inside the title. The greedy match keeps mid-title "by" intact
  // ("Stand by Me by Ben E. King"); a bare pronoun after "by" is not an
  // artist ("Stand by Me" alone).
  const byMatch = cleaned.match(/^(.*)\s+by\s+(.+)$/i)
  if (byMatch && byMatch[1] && byMatch[2]) {
    const song = byMatch[1]!.trim()
    const byArtist = byMatch[2]!.trim()
    if (
      song.length >= 2 &&
      byArtist.length >= 3 &&
      !/^(me|you|him|her|us|them|it|myself|yourself|ourselves|themselves)$/i.test(byArtist)
    ) {
      return { title: song, artist: byArtist, artistSource: 'title-by', channelStrong, channelGarbage }
    }
  }

  if (topicMatch && topicMatch[1]?.trim()) {
    return {
      title: cleaned || video.title,
      artist: channelArtist || null,
      artistSource: 'channel',
      channelStrong,
      channelGarbage,
    }
  }

  return {
    title: cleaned || video.title,
    artist: channelArtist || null,
    artistSource: channelArtist ? 'channel' : null,
    channelStrong,
    channelGarbage,
  }
}

/** Prefer yt-dlp's own track/artist fields when the full metadata has them. */
function guessFromRaw(
  raw: any,
  video: VideoInfo,
): TitleGuess {
  const track = typeof raw?.track === 'string' ? raw.track.trim() : ''
  const artist = typeof raw?.artist === 'string' ? raw.artist.trim() : ''
  if (track) {
    return {
      title: track,
      artist: artist || null,
      artistSource: 'channel',
      channelStrong: false,
      channelGarbage: false,
    }
  }
  return guessArtistTitle(video)
}

type CatalogLookup = (
  title: string,
  artist: string | null,
  swap?: boolean,
  budget?: MusicBrainzBudget,
) => Promise<ItunesMatch | MusicBrainzMatch | null>

const itunesLookup: CatalogLookup = (title, artist, swap) =>
  swap ? searchMatchSwapped(title, artist) : searchMatch(title, artist)

const musicBrainzLookup: CatalogLookup = (title, artist, swap, budget) =>
  searchMusicBrainz(title, artist, swap, budget)

/** A title-only hit may be a same-named cover by a different artist (e.g.
 * iTunes' "Take a Slice" by ByAstral vs Glass Animals' song, which isn't in
 * the iTunes catalog). When the channel claims to BE the artist (its name
 * isn't a random remix/lyrics account), an iTunes hit crediting a different
 * artist is rejected so the other catalog can find the real song —
 * misattributing to a cover is worse than no match. MusicBrainz hits skip the
 * check: its scoring (official studio releases, release-count tiebreak)
 * already prefers the canonical recording, which is usually the right artist
 * even on a random remix account. On a garbage channel the artist claim is
 * noise, so any iTunes title match is taken. */
function verifyTitleOnly(
  match: ItunesMatch | MusicBrainzMatch | null,
  guess: TitleGuess,
): ItunesMatch | MusicBrainzMatch | null {
  if (!match || match.source === 'musicbrainz') return match
  if (guess.channelGarbage || !guess.artist) return match
  return artistsAgree(match.artist, guess.artist) ? match : null
}

/** One catalog's full attempt at a match, run against the guess for a video:
 * variant-aware first (stripped song name), then the plain chain — forward
 * (title, artist), swapped for reversed "Title - Artist" uploads ("Hey Kids -
 * Molina" parses into the wrong order; the swapped pairing resolves them when
 * the forward one misses), then title-only. The title-only retry only fires
 * when the artist came from the uploader's channel — a random anime/lyrics
 * account's name pollutes the query and can hide a perfect title match. When
 * the artist was written in the title itself ("Song by Artist" or an
 * "Artist - Title" split), it is the uploader's own claim about the song —
 * dropping it only lets an unrelated same-name cover win, so no retry. When
 * the channel is the artist's own (Topic/VEVO/Official), a title-only result
 * crediting a *different* artist is a same-named cover too — it is rejected
 * so the other catalog can find the real song instead of misattributing. */
async function catalogMatch(
  lookup: CatalogLookup,
  guess: TitleGuess,
  variantTags: string[],
  candidates: string[],
  budget?: MusicBrainzBudget,
): Promise<ItunesMatch | MusicBrainzMatch | null> {
  let match: ItunesMatch | MusicBrainzMatch | null = null
  if (variantTags.length > 0) {
    const strippedGuess = stripVariantTags(guess.title, variantTags)
    if (guess.artist && (guess.artistSource === 'title-by' || guess.channelStrong)) {
      // The artist came from the title itself ("Song by Artist") or from the
      // artist's own channel (Topic/VEVO/Official) — keep it in the query.
      // Dropping it would let an unrelated same-name cover win.
      match = await lookup(strippedGuess, guess.artist, undefined, budget)
    } else {
      // Search title-only — the uploader channel is usually a random remix
      // account, not the original artist.
      for (const term of candidates) {
        match = verifyTitleOnly(await lookup(term, null, undefined, budget), guess)
        if (match) break
      }
    }
  }
  if (!match) {
    // Plain normalization. This also covers titles where the "tag" is
    // literally the song name (e.g. Daniel Caesar's "Best Part").
    match = await lookup(guess.title, guess.artist, undefined, budget)
    if (!match && guess.artist && guess.title) {
      match = await lookup(guess.title, guess.artist, true, budget)
    }
    if (!match && guess.artist && guess.artistSource === 'channel') {
      match = verifyTitleOnly(await lookup(guess.title, null, undefined, budget), guess)
    }
  }
  return match
}

/** Cache-or-fresh catalog normalization for one video. */
async function resolveEnrichment(
  video: VideoInfo,
  raw?: any,
  mbBudget?: MusicBrainzBudget,
): Promise<Enrichment | null> {
  const cached = getEnrichment(video.url)
  if (cached !== null || enrichCache.has(video.url)) return cached

  const guess = raw ? guessFromRaw(raw, video) : guessArtistTitle(video)
  const variantTags = extractVariantTags(video.title)

  // Reuse a known song before asking the catalogs: the same track is uploaded
  // many times, and once it's been matched, every later upload (and
  // differently phrased query for it) can adopt the canonical result without a
  // fresh lookup. Variants are excluded — their tags change the result, and
  // they never share the original's enrichment.
  if (variantTags.length === 0) {
    const guessKey = normalizeKey(guess.artist ?? '', guess.title)
    // Reversed-title uploads ("Loser - Tame Impala" = Title - Artist) parse
    // into the wrong order; check the swapped key too, so a song matched
    // under its canonical order is still reused.
    const swappedKey = normalizeKey(guess.title, guess.artist ?? '')
    const keys = guessKey === swappedKey ? [guessKey] : [guessKey, swappedKey]
    for (const key of keys) {
      const songHit = songCache.get(key)
      if (songHit && Date.now() - songHit.at < SONG_CACHE_TTL_MS) {
        const enrichment = songHit.enrichment
        enrichCache.set(video.url, { at: Date.now(), enrichment })
        return enrichment
      }
    }
  }

  // A variant upload ("Song (slowed + reverb)", "Song (best part)", …) is
  // matched against the catalogs by its stripped song name, so the original's
  // artist/cover apply while the tags stay in the result's name. The variant
  // keeps itunesId null so it never collapses with the original song (or other
  // variants) in dedupe — it's its own independent track, and the original's
  // 30-second preview is not offered on edited versions.
  const strippedRaw = stripVariantTags(cleanTitle(video.title), variantTags)
  const strippedGuess = stripVariantTags(guess.title, variantTags)
  // Try the whole cleaned title with the tags stripped first — this is the
  // only reliable query for reversed titles like "something in the way -
  // nirvana (sped up)", which the "Artist - Title" parser would misread as
  // song="nirvana". Fall back to the parsed guess when that misses.
  const candidates = [...new Set([strippedRaw, strippedGuess])].filter((t) => t.length >= 2)

  // A variant carries no artist signal of its own (remix/lyrics channels name
  // themselves after what they post), so its title-only lookup can land on a
  // same-named cover. If the canonical version of this song was already
  // matched (same stripped title), reuse its artist/album/artwork — free, no
  // extra catalog query. Uploads that named an artist themselves ("Song by
  // Artist", the artist's own channel) query by it instead and are skipped.
  if (variantTags.length > 0 && !hasOwnArtistClaim(guess)) {
    for (const term of candidates) {
      const hit = titleCache.get(titleKey(term))
      if (hit && Date.now() - hit.at < SONG_CACHE_TTL_MS) {
        const enrichment: Enrichment = {
          title: `${hit.enrichment.title} (${variantTags.join(' + ')})`,
          artist: hit.enrichment.artist,
          album: hit.enrichment.album,
          itunesId: null,
          artworkUrl: hit.enrichment.artworkUrl,
          previewUrl: null,
          trackTimeMillis: hit.enrichment.trackTimeMillis,
          source: hit.enrichment.source,
        }
        enrichCache.set(video.url, { at: Date.now(), enrichment })
        return enrichment
      }
    }
  }

  // iTunes first — it is the only catalog with a 30-second preview and a
  // stable Apple track id. MusicBrainz fills the gaps when the iTunes catalog
  // doesn't carry the track (indie, self-released, region-locked releases).
  let match: ItunesMatch | MusicBrainzMatch | null = await catalogMatch(
    itunesLookup,
    guess,
    variantTags,
    candidates,
  )
  let deezerPreview: string | null = null
  if (!match) {
    match = await catalogMatch(musicBrainzLookup, guess, variantTags, candidates, mbBudget)
    if (match && match.source === 'musicbrainz' && variantTags.length === 0) {
      // MusicBrainz carries no audio previews — borrow the ~30s preview from
      // Deezer's free API for the matched track, so songs the iTunes catalog
      // lacks still get a preview button (variants stay preview-less by
      // design: an edited upload's "preview" would be the original's).
      deezerPreview = await searchDeezerPreview(match.title, match.artist)
    }
  }
  const isVariant = variantTags.length > 0 && match !== null

  const enrichment: Enrichment | null = match
    ? {
        title: isVariant ? `${match.title} (${variantTags.join(' + ')})` : match.title,
        artist: match.artist,
        album: match.album,
        itunesId: isVariant ? null : match.trackId !== null ? String(match.trackId) : null,
        artworkUrl: match.artworkUrl,
        previewUrl: isVariant ? null : (deezerPreview ?? match.previewUrl),
        trackTimeMillis: match.trackTimeMillis,
        source: match.source,
      }
    : null

  enrichCache.set(video.url, { at: Date.now(), enrichment })
  // Remember the song itself, so future uploads/queries skip the iTunes lookup
  // entirely. Keyed by the canonical name/artist AND by the guess that led to
  // it (they can differ in phrasing), so both directions hit.
  if (match && variantTags.length === 0) {
    const canonicalKey = normalizeKey(match.artist, match.title)
    const guessKey = normalizeKey(guess.artist ?? '', guess.title)
    songCache.set(canonicalKey, { at: Date.now(), enrichment })
    if (guessKey !== canonicalKey) songCache.set(guessKey, { at: Date.now(), enrichment })
    // Garbage-channel matches are the same-named-cover risk — a cover must
    // not become the canonical "title" in the title-only index.
    if (!guess.channelGarbage && enrichment) {
      for (const key of indexTitleKeys(enrichment, guess)) {
        titleCache.set(key, { at: Date.now(), enrichment })
      }
    }
  }
  if (enrichCache.size > 1000) prune(enrichCache, ENRICH_TTL_MS)
  if (songCache.size > 1000) prune(songCache, SONG_CACHE_TTL_MS)
  if (titleCache.size > 1000) prune(titleCache, SONG_CACHE_TTL_MS)
  return enrichment
}

/**
 * Normalize the top results, attach cover art and previews, and collapse
 * duplicate uploads of the same song to the upload whose real audio length
 * matches the catalog track length (trackTimeMillis) most closely.
 *
 * Duplicate uploads are grouped BEFORE the expensive part: a search often
 * returns the same track several times (official upload, Topic channel,
 * re-uploads, reversed-title copies), and one iTunes lookup can serve the
 * whole group — members adopt the same canonical metadata, which also makes
 * the final dedupe collapse them into a single result. Groups resolve
 * concurrently; the global iTunes throttle (a token bucket at ~20 calls/min)
 * still paces every call, so Apple's rate limit is untouched.
 */
export async function enrichResults(results: VideoInfo[]): Promise<EnrichedResult[]> {
  const candidates = results.slice(0, ENRICH_LIMIT)
  if (candidates.length === 0) return []

  const groups = new Map<string, VideoInfo[]>()
  for (const video of candidates) {
    const key = groupKey(video)
    const group = groups.get(key)
    if (group) group.push(video)
    else groups.set(key, [video])
  }

  // Resolve one lookup per group, trying each member's guess until one
  // matches: the first upload in YouTube order is usually right, but a
  // reversed-title copy ("Loser - Tame Impala" = Title - Artist) may be the
  // only one that parses correctly. Members that never resolve keep their raw
  // metadata and stay visible as separate uploads.
  const byKey = new Map<string, Enrichment | null>()
  // One budget shared by every group: the first songs in YouTube order spend
  // it, the rest stay unmatched rather than queueing slow MusicBrainz
  // lookups behind them.
  const mbBudget: MusicBrainzBudget = { remaining: MB_BUDGET_PER_SEARCH }
  await Promise.all(
    [...groups.entries()].map(async ([key, group]) => {
      for (const video of group) {
        const enrichment = await resolveEnrichment(video, undefined, mbBudget).catch(() => null)
        if (enrichment !== null) {
          byKey.set(key, enrichment)
          break
        }
      }
      if (!byKey.has(key)) byKey.set(key, null)
    }),
  )

  // Variants (and uploads on random remix/lyrics channels) resolve against
  // the title alone, so their catalog hit can be a same-named cover (iTunes'
  // ByAstral for Glass Animals' "Take a Slice", which isn't in the iTunes
  // catalog). Now that every group is resolved, re-attribute those results to
  // the canonical song of the same stripped title — a trustworthy non-variant
  // match from this search, or one known from a previous search. Free: no
  // extra MusicBrainz query, and the re-attributed results then collapse with
  // the canonical upload in dedupe.
  const titleIndex = new Map<string, Enrichment>()
  for (const [key, group] of groups) {
    if (key.startsWith('variant:')) continue
    const enrichment = byKey.get(key)
    if (!enrichment) continue
    const guess = guessArtistTitle(group[0]!)
    // Garbage-channel matches are the same-named-cover risk themselves — they
    // don't get to define the canonical "title" for this search.
    if (guess.channelGarbage) continue
    for (const indexKey of indexTitleKeys(enrichment, guess)) {
      titleIndex.set(indexKey, enrichment)
    }
  }
  for (const [key, group] of groups) {
    const current = byKey.get(key)
    if (!current) continue
    const video = group[0]!
    const tags = extractVariantTags(video.title)
    const guess = guessArtistTitle(video)
    const isVariant = key.startsWith('variant:')
    if (!isVariant) {
      // Only garbage-channel uploads can land on a same-named cover via the
      // title-only retry; real artist channels are protected by the strict
      // artist rule, and a title that named an artist is its own claim.
      if (!(guess.artistSource === 'channel' && guess.channelGarbage)) continue
    } else if (hasOwnArtistClaim(guess)) {
      // The variant itself named an artist ("Song by Artist", the artist's
      // own channel) — its query respected that claim; leave it alone.
      continue
    }
    const stripped = [...new Set([
      stripVariantTags(cleanTitle(video.title), tags),
      stripVariantTags(guess.title, tags),
    ])].filter((t) => t.length >= 2)
    let canon: Enrichment | null = null
    for (const term of stripped) {
      canon = titleIndex.get(titleKey(term)) ?? null
      if (canon) break
      const hit = titleCache.get(titleKey(term))
      if (hit && Date.now() - hit.at < SONG_CACHE_TTL_MS) {
        canon = hit.enrichment
        break
      }
    }
    if (!canon || artistsAgree(current.artist, canon.artist)) continue
    const fixed: Enrichment = {
      title: tags.length > 0 ? `${canon.title} (${tags.join(' + ')})` : canon.title,
      artist: canon.artist,
      album: canon.album,
      itunesId: tags.length > 0 ? null : canon.itunesId,
      artworkUrl: canon.artworkUrl,
      previewUrl: tags.length > 0 ? null : canon.previewUrl,
      trackTimeMillis: canon.trackTimeMillis,
      source: canon.source,
    }
    byKey.set(key, fixed)
    for (const v of group) enrichCache.set(v.url, { at: Date.now(), enrichment: fixed })
  }

  // Keep the results in their original order — dedupe below preserves the
  // first upload of each song, so display order stays stable across searches.
  const enriched: EnrichedResult[] = candidates.map((video) => {
    const key = groupKey(video)
    const normalization = byKey.get(key) ?? null
    const guess = guessArtistTitle(video)
    const tags = extractVariantTags(video.title)

    let title = video.title
    let artist = video.artist
    if (normalization) {
      title = normalization.title
      artist = normalization.artist
    } else if (tags.length > 0) {
      // Unmatched variant: keep the clean song name with its tags and any
      // artist the title itself named ("Take a Slice (without intro)"). When
      // the tag is literally the song name ("Best Part"), the stripped name
      // is empty — keep the raw title rather than show " (best part)".
      const song = stripVariantTags(guess.title, tags)
      if (song) {
        title = `${song} (${tags.join(' + ')})`
        if (guess.artist && guess.artistSource !== 'channel') artist = guess.artist
      }
    } else if (guess.artistSource === 'title-by' && guess.artist) {
      // Unmatched "Song by Artist": at least separate the two for display.
      title = guess.title
      artist = guess.artist
    }

    return {
      ...video,
      title,
      artist,
      album: normalization?.album ?? null,
      artworkUrl: normalization?.artworkUrl ?? null,
      previewUrl: normalization?.previewUrl ?? null,
      itunesId: normalization?.itunesId ?? null,
      trackTimeMillis: normalization?.trackTimeMillis ?? null,
      matched: normalization !== null,
      source: normalization?.source ?? null,
    }
  })

  // Collapse duplicate uploads of the same song into a single result — keeping
  // the upload whose real audio length (video duration) comes closest to the
  // iTunes track length (trackTimeMillis): the actual studio recording, not a
  // live take, a sped-up re-upload, or a shortened edit. iTunes gives a stable
  // key; fall back to the normalized title + artist. When no canonical length
  // is known (no iTunes match, or the track time is missing), the first upload
  // in search order wins, as before.
  const bestByKey = new Map<string, EnrichedResult>()
  for (const result of enriched) {
    const key = dedupeKey(result)
    const current = bestByKey.get(key)
    if (!current) {
      bestByKey.set(key, result)
      continue
    }
    const trackTimeS = current.trackTimeMillis != null ? current.trackTimeMillis / 1000 : null
    if (trackTimeS === null) continue
    const diff = (d: number | null): number =>
      d === null ? Number.POSITIVE_INFINITY : Math.abs(d - trackTimeS)
    if (diff(result.duration) < diff(current.duration)) bestByKey.set(key, result)
  }

  // Emit each song's winning upload at its first position, so the display
  // order stays stable across searches.
  const unique: EnrichedResult[] = []
  const emitted = new Set<string>()
  for (const result of enriched) {
    const key = dedupeKey(result)
    if (emitted.has(key)) continue
    emitted.add(key)
    unique.push(bestByKey.get(key)!)
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

/** How uploads are grouped for a single iTunes lookup — variants are their own
 * track (tags make them independent), everything else groups by song. */
function groupKey(video: VideoInfo): string {
  return extractVariantTags(video.title).length > 0
    ? `variant:${video.url}`
    : symmetricSongKey(video)
}

/** Identity used to collapse duplicate uploads: the iTunes id when matched,
 * otherwise a normalized title/artist that is order-insensitive for plain
 * songs (so reversed "Title - Artist" copies collapse) but tag-aware for
 * variants (so two edits of the same song never collapse). */
function dedupeKey(result: EnrichedResult): string {
  if (result.itunesId) return result.itunesId
  if (extractVariantTags(result.title).length > 0) {
    return normalizeKey(result.artist, result.title)
  }
  const guess = guessArtistTitle(result)
  const forward = normalizeKey(guess.artist ?? '', guess.title)
  const backward = normalizeKey(guess.title, guess.artist ?? '')
  return forward < backward ? `${forward} || ${backward}` : `${backward} || ${forward}`
}

/**
 * An order-insensitive key for grouping uploads of the same song: "Loser" by
 * Tame Impala groups with "Loser - Tame Impala (…)" even though the latter
 * parses as title-first. Built from the normalized title/artist pair.
 */
function symmetricSongKey(video: VideoInfo): string {
  const guess = guessArtistTitle(video)
  const forward = normalizeKey(guess.artist ?? '', guess.title)
  const backward = normalizeKey(guess.title, guess.artist ?? '')
  return forward < backward ? `${forward} || ${backward}` : `${backward} || ${forward}`
}

function normalizeKey(artist: string, title: string): string {
  const norm = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${norm(artist)} - ${norm(title)}`
}

/** Title-only key for the title index (variants have no artist to key by). */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Keys a canonical match for the title-only index: the canonical title, plus
 * (when the title itself was trustworthy — Topic/official uploads and "Song by
 * Artist" titles, not ambiguous "Artist - Title" splits that may be reversed)
 * the title as the upload phrased it. */
function indexTitleKeys(enrichment: Enrichment, guess: TitleGuess): string[] {
  const keys = new Set([titleKey(enrichment.title)])
  if (guess.artistSource === 'channel' || guess.artistSource === 'title-by') {
    const g = titleKey(guess.title)
    if (g) keys.add(g)
  }
  return [...keys]
}

/** Does the upload itself claim an artist (its own title or channel)? Those
 * claims are respected over any title-index guess — a variant can't be
 * re-attributed away from an artist it explicitly named. */
function hasOwnArtistClaim(guess: TitleGuess): boolean {
  return !!guess.artist && (guess.artistSource === 'title-by' || guess.channelStrong)
}

function prune(map: Map<string, { at: number }>, ttlMs: number): void {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.at > ttlMs) map.delete(key)
  }
}
