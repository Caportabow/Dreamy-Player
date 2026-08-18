import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { playlists } from '../../db/schema'
import { getOwnedPlaylist } from '../../utils/playlists'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'id')
  if (!playlistId) throw createError({ statusCode: 400, statusMessage: 'Missing playlist id.' })

  await getOwnedPlaylist(event, playlistId)
  const body = await readBody<{ name?: string; description?: string; artworkKey?: string | null }>(event)

  const next: Partial<typeof playlists.$inferInsert> = { updatedAt: new Date() }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Playlist name cannot be empty.' })
    if (name.length > 80) throw createError({ statusCode: 400, statusMessage: 'Playlist name is too long.' })
    next.name = name
  }
  if (typeof body.description === 'string') {
    next.description = body.description.trim().slice(0, 300) || null
  }
  if ('artworkKey' in body) {
    next.artworkKey = body.artworkKey ?? null
  }

  await db.update(playlists).set(next).where(eq(playlists.id, playlistId))

  const updated = await db.query.playlists.findFirst({
    where: eq(playlists.id, playlistId),
  })
  return { playlist: updated }
})
