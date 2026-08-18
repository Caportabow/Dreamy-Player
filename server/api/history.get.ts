import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { favourites, playHistory, tracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100)

  const rows = await db
    .select({ event: playHistory, track: tracks })
    .from(playHistory)
    .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
    .where(eq(playHistory.userId, user.id))
    .orderBy(desc(playHistory.playedAt))
    .limit(limit)

  // Attach favourite flags so the heart reflects the real state everywhere.
  const favRows = rows.length
    ? await db
        .select({ trackId: favourites.trackId })
        .from(favourites)
        .where(
          and(eq(favourites.userId, user.id), inArray(favourites.trackId, rows.map((r) => r.track.id))),
        )
    : []
  const favSet = new Set(favRows.map((f) => f.trackId))

  return {
    events: rows.map((r) => ({ ...r.event, track: { ...r.track, favourite: favSet.has(r.track.id) } })),
  }
})
