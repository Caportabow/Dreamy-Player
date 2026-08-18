import { and, asc, desc, eq, inArray, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { favourites, tracks } from '../db/schema'

const SORTS = ['title', 'artist', 'added'] as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 120) : ''
  const sort = (typeof query.sort === 'string' ? query.sort : 'added') as (typeof SORTS)[number]
  const order = query.order === 'asc' ? 'asc' : 'desc'
  const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)

  const conditions = []
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
          ? asc(tracks.createdAt)
          : desc(tracks.createdAt)

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, total] = await Promise.all([
    db.select().from(tracks).where(where).orderBy(orderBy, desc(tracks.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(tracks).where(where),
  ])

  // Attach favourite flags for signed-in users.
  let favouriteIds: Set<string> | null = null
  const user = event.context.user as { id: string } | null
  if (user && rows.length > 0) {
    const favs = await db
      .select({ trackId: favourites.trackId })
      .from(favourites)
      .where(and(eq(favourites.userId, user.id), inArray(favourites.trackId, rows.map((r) => r.id))))
    favouriteIds = new Set(favs.map((f) => f.trackId))
  }

  return {
    tracks: rows.map((t) => ({ ...t, favourite: favouriteIds?.has(t.id) ?? false })),
    total: total[0]?.count ?? 0,
  }
})
