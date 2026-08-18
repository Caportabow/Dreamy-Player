import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db'
import { favourites, tracks, userTracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

const SORTS = ['title', 'artist', 'added'] as const

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)

  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 120) : ''
  const sort = (typeof query.sort === 'string' ? query.sort : 'added') as (typeof SORTS)[number]
  const order = query.order === 'asc' ? 'asc' : 'desc'
  const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)

  const conditions: (SQL | undefined)[] = [eq(userTracks.userId, user.id)]
  if (search) {
    const like = `%${search}%`
    conditions.push(or(ilike(tracks.title, like), ilike(tracks.artist, like), ilike(tracks.album, like)))
  }

  const orderBy =
    sort === 'title'
      ? order === 'asc'
        ? asc(tracks.title)
        : desc(tracks.title)
      : sort === 'artist'
        ? order === 'asc'
          ? asc(tracks.artist)
          : desc(tracks.artist)
        : order === 'asc'
          ? asc(userTracks.addedAt)
          : desc(userTracks.addedAt)

  const where = and(...conditions)

  const [rows, total] = await Promise.all([
    db
      .select({ track: tracks, addedAt: userTracks.addedAt })
      .from(userTracks)
      .innerJoin(tracks, eq(userTracks.trackId, tracks.id))
      .where(where)
      .orderBy(orderBy, desc(userTracks.addedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userTracks)
      .innerJoin(tracks, eq(userTracks.trackId, tracks.id))
      .where(where),
  ])

  // Attach favourite flags for the signed-in user.
  let favouriteIds = new Set<string>()
  if (rows.length > 0) {
    const favs = await db
      .select({ trackId: favourites.trackId })
      .from(favourites)
      .where(and(eq(favourites.userId, user.id), inArray(favourites.trackId, rows.map((r) => r.track.id))))
    favouriteIds = new Set(favs.map((f) => f.trackId))
  }

  return {
    tracks: rows.map((r) => ({ ...r.track, favourite: favouriteIds.has(r.track.id) })),
    total: total[0]?.count ?? 0,
  }
})
