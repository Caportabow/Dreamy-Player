import { asc, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { playlistTracks } from '../../../db/schema'
import { getOwnedPlaylist } from '../../../utils/playlists'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'id')
  if (!playlistId) throw createError({ statusCode: 400, statusMessage: 'Missing playlist id.' })

  await getOwnedPlaylist(event, playlistId)

  const body = await readBody<{ orderedTrackIds?: string[] }>(event)
  const orderedTrackIds = Array.isArray(body.orderedTrackIds) ? body.orderedTrackIds : []
  if (orderedTrackIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No track order provided.' })
  }
  if (orderedTrackIds.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Too many tracks.' })
  }

  const existing = await db
    .select({ trackId: playlistTracks.trackId })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(asc(playlistTracks.position))

  const existingIds = new Set(existing.map((e) => e.trackId))
  const valid =
    orderedTrackIds.every((id) => existingIds.has(id)) &&
    existingIds.size === orderedTrackIds.length
  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: 'Track order does not match the playlist.' })
  }

  await db.transaction(async (tx) => {
    await tx.delete(playlistTracks).where(eq(playlistTracks.playlistId, playlistId))
    await tx.insert(playlistTracks).values(
      orderedTrackIds.map((trackId, position) => ({ playlistId, trackId, position })),
    )
  })

  return { reordered: true }
})
