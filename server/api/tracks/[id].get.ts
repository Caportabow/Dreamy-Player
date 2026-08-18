import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { favourites, tracks, userTracks } from '../../db/schema'
import { getCurrentUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  const track = await db.query.tracks.findFirst({ where: eq(tracks.id, id) })
  if (!track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  // A track only exists in a user's world if it is in their library.
  const membership = await db.query.userTracks.findFirst({
    where: and(eq(userTracks.userId, user.id), eq(userTracks.trackId, id)),
  })
  if (!membership) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  const fav = await db.query.favourites.findFirst({
    where: and(eq(favourites.userId, user.id), eq(favourites.trackId, id)),
  })

  return { track: { ...track, favourite: !!fav } }
})
