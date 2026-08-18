import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { favourites, tracks } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  const track = await db.query.tracks.findFirst({ where: eq(tracks.id, id) })
  if (!track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  const user = event.context.user as { id: string } | null
  let favourite = false
  if (user) {
    const fav = await db.query.favourites.findFirst({
      where: and(eq(favourites.userId, user.id), eq(favourites.trackId, id)),
    })
    favourite = !!fav
  }

  return { track: { ...track, favourite } }
})
