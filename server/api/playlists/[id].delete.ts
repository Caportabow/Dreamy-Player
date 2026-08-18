import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { playlists } from '../../db/schema'
import { getOwnedPlaylist } from '../../utils/playlists'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'id')
  if (!playlistId) throw createError({ statusCode: 400, statusMessage: 'Missing playlist id.' })

  await getOwnedPlaylist(event, playlistId)

  await db.delete(playlists).where(eq(playlists.id, playlistId))
  return { deleted: true }
})
