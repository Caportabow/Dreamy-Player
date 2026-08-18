import { eq } from 'drizzle-orm'
import { db } from '../db'
import { favourites, tracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const body = await readBody<{ trackId?: string }>(event)

  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  if (!trackId) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  const track = await db.query.tracks.findFirst({ where: eq(tracks.id, trackId) })
  if (!track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  await db
    .insert(favourites)
    .values({ userId: user.id, trackId })
    .onConflictDoNothing()

  return { favourited: true }
})
