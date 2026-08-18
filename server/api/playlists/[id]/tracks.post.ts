import { and, eq, max } from 'drizzle-orm'
import { db } from '../../../db'
import { playlistTracks, tracks } from '../../../db/schema'
import { getOwnedPlaylist } from '../../../utils/playlists'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'id')
  if (!playlistId) throw createError({ statusCode: 400, statusMessage: 'Missing playlist id.' })

  await getOwnedPlaylist(event, playlistId)

  const body = await readBody<{ trackId?: string }>(event)
  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  if (!trackId) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  const track = await db.query.tracks.findFirst({ where: eq(tracks.id, trackId) })
  if (!track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  const existing = await db.query.playlistTracks.findFirst({
    where: and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)),
  })
  if (existing) return { added: false }

  const maxPos = await db
    .select({ max: max(playlistTracks.position) })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))

  await db.insert(playlistTracks).values({
    playlistId,
    trackId,
    position: (maxPos[0]?.max ?? -1) + 1,
  })

  return { added: true }
})
