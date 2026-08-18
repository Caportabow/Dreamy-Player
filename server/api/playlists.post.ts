import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { playlists } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const body = await readBody<{ name?: string; description?: string }>(event)

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Please give your playlist a name.' })
  if (name.length > 80) throw createError({ statusCode: 400, statusMessage: 'Playlist name is too long.' })

  const description =
    typeof body.description === 'string' ? body.description.trim().slice(0, 300) : ''

  const id = randomUUID()
  await db.insert(playlists).values({ id, userId: user.id, name, description: description || null })

  const playlist = await db.query.playlists.findFirst({ where: eq(playlists.id, id) })
  return { playlist: { ...playlist!, trackCount: 0 } }
})
