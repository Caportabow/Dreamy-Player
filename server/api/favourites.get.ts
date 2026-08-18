import { desc, eq, ilike, and } from 'drizzle-orm'
import { db } from '../db'
import { favourites, tracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 120) : ''

  const rows = await db
    .select({ favourite: favourites, track: tracks })
    .from(favourites)
    .innerJoin(tracks, eq(favourites.trackId, tracks.id))
    .where(
      and(
        eq(favourites.userId, user.id),
        search
          ? ilike(tracks.title, `%${search}%`)
          : undefined,
      ),
    )
    .orderBy(desc(favourites.createdAt))

  return {
    tracks: rows.map((r) => ({ ...r.track, favourite: true })),
  }
})
