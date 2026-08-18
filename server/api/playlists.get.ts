import { asc, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { playlistTracks, playlists, tracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)

  const rows = await db
    .select({ playlist: playlists, trackCount: count(playlistTracks.trackId) })
    .from(playlists)
    .leftJoin(playlistTracks, eq(playlists.id, playlistTracks.playlistId))
    .where(eq(playlists.userId, user.id))
    .groupBy(playlists.id)
    .orderBy(desc(playlists.createdAt))

  // Resolve a cover per playlist: its own artwork, else the first track's
  // artwork (by playlist position), else nothing.
  const firstArtwork = new Map<string, string | null>()
  const ids = rows.map((r) => r.playlist.id)
  if (ids.length > 0) {
    const firstTracks = await db
      .selectDistinctOn([playlistTracks.playlistId], {
        playlistId: playlistTracks.playlistId,
        artworkKey: tracks.artworkKey,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(inArray(playlistTracks.playlistId, ids))
      .orderBy(playlistTracks.playlistId, asc(playlistTracks.position))
    for (const t of firstTracks) firstArtwork.set(t.playlistId, t.artworkKey)
  }

  return {
    playlists: rows.map((r) => ({
      ...r.playlist,
      trackCount: r.trackCount,
      artworkKey: r.playlist.artworkKey ?? firstArtwork.get(r.playlist.id) ?? null,
    })),
  }
})
