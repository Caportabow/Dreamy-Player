export interface Track {
  id: string
  title: string
  artist: string
  album: string | null
  duration: number
  audioKey: string
  artworkKey: string | null
  sourceUrl: string
  sourceId: string | null
  addedBy: string | null
  createdAt: string
  favourite?: boolean
}

export interface QueueItem {
  id: string
  title: string
  artist: string
  album: string | null
  duration: number
  audioKey: string
  artworkKey: string | null
}

export interface AuthUser {
  id: string
  email: string
  profile: {
    displayName: string | null
    avatarKey: string | null
  } | null
}

export type PlaylistStatus = 'ready' | 'saving'

export interface Playlist {
  id: string
  name: string
  description: string | null
  artworkKey: string | null
  trackCount: number
  createdAt: string
}

export interface HistoryEvent {
  id: string
  trackId: string
  playedAt: string
  listenedSeconds: number
  completed: boolean
  track: Track
}

export type JobStatus =
  | 'queued'
  | 'searching'
  | 'downloading'
  | 'converting'
  | 'uploading'
  | 'complete'
  | 'failed'

export interface DownloadJob {
  id: string
  status: JobStatus
  stage: string | null
  progress: number
  error: string | null
  errorCode: string | null
  query: string | null
  title: string | null
  artist: string | null
  duration: number | null
  artworkUrl: string | null
  trackId: string | null
  createdAt: string
  updatedAt: string
  track?: Track | null
}

export interface SearchResult {
  id: string
  title: string
  artist: string
  duration: number
  thumbnail: string | null
  url: string
}

export interface TopTrackEntry {
  track: Track
  plays: number
  seconds: number
}

export interface TopArtistEntry {
  artist: string
  plays: number
  seconds: number
}

export interface StatsData {
  totalSeconds: number
  totalPlays: number
  uniqueTracks: number
  topTracks: TopTrackEntry[]
  topArtists: TopArtistEntry[]
  daily: { date: string; seconds: number; plays: number }[]
}

export interface PlayerStatePayload {
  queue: QueueItem[]
  currentIndex: number
  position: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeatMode: 'off' | 'queue' | 'track'
}

export type RepeatMode = 'off' | 'queue' | 'track'

export function toQueueItem(track: Track): QueueItem {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    audioKey: track.audioKey,
    artworkKey: track.artworkKey,
  }
}

export function mediaUrl(key: string | null | undefined): string {
  if (!key) return ''
  return `/api/media?key=${encodeURIComponent(key)}`
}
