import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { favourites } from '../../db/schema'
import { getCurrentUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const trackId = getRouterParam(event, 'trackId')
  if (!trackId) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  await db
    .delete(favourites)
    .where(and(eq(favourites.userId, user.id), eq(favourites.trackId, trackId)))

  return { favourited: false }
})
