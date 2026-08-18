import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { playlistTracks } from '../../../../db/schema'
import { getOwnedPlaylist } from '../../../../utils/playlists'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'id')
  const trackId = getRouterParam(event, 'trackId')
  if (!playlistId || !trackId) throw createError({ statusCode: 400, statusMessage: 'Missing ids.' })

  await getOwnedPlaylist(event, playlistId)

  await db
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))

  // Renumber so positions stay dense (0..n-1).
  const remaining = await db
    .select({ trackId: playlistTracks.trackId })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(asc(playlistTracks.position))

  await db.transaction(async (tx) => {
    for (let i = 0; i < remaining.length; i++) {
      await tx
        .update(playlistTracks)
        .set({ position: i })
        .where(
          and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, remaining[i]!.trackId)),
        )
    }
  })

  return { removed: true }
})
