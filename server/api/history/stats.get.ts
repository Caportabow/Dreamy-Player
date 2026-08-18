import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { favourites, playHistory, tracks } from '../../db/schema'
import { getCurrentUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const since = new Date(Date.now() - 29 * 86_400_000)

  const [totals] = await db
    .select({
      totalSeconds: sql<number>`coalesce(sum(${playHistory.listenedSeconds}), 0)::int`,
      totalPlays: sql<number>`count(*)::int`,
      uniqueTracks: sql<number>`count(distinct ${playHistory.trackId})::int`,
    })
    .from(playHistory)
    .where(eq(playHistory.userId, user.id))

  const [topTracks, topArtists, dailyRows] = await Promise.all([
    db
      .select({
        track: tracks,
        plays: sql<number>`count(*)::int`,
        seconds: sql<number>`coalesce(sum(${playHistory.listenedSeconds}), 0)::int`,
      })
      .from(playHistory)
      .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
      .where(eq(playHistory.userId, user.id))
      .groupBy(tracks.id)
      .orderBy(desc(sql`sum(${playHistory.listenedSeconds})`))
      .limit(5),
    db
      .select({
        artist: tracks.artist,
        plays: sql<number>`count(*)::int`,
        seconds: sql<number>`coalesce(sum(${playHistory.listenedSeconds}), 0)::int`,
      })
      .from(playHistory)
      .innerJoin(tracks, eq(playHistory.trackId, tracks.id))
      .where(eq(playHistory.userId, user.id))
      .groupBy(tracks.artist)
      .orderBy(desc(sql`sum(${playHistory.listenedSeconds})`))
      .limit(5),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${playHistory.playedAt}), 'YYYY-MM-DD')`,
        seconds: sql<number>`coalesce(sum(${playHistory.listenedSeconds}), 0)::int`,
        plays: sql<number>`count(*)::int`,
      })
      .from(playHistory)
      .where(and(eq(playHistory.userId, user.id), gte(playHistory.playedAt, since)))
      .groupBy(sql`date_trunc('day', ${playHistory.playedAt})`),
  ])

  // Attach favourite flags so hearts reflect the real state everywhere.
  const favRows = topTracks.length
    ? await db
        .select({ trackId: favourites.trackId })
        .from(favourites)
        .where(
          and(
            eq(favourites.userId, user.id),
            inArray(favourites.trackId, topTracks.map((t) => t.track.id)),
          ),
        )
    : []
  const favSet = new Set(favRows.map((f) => f.trackId))

  // Fill a complete 30-day series (oldest → newest).
  const byDay = new Map(dailyRows.map((r) => [r.day, r]))
  const daily: { date: string; seconds: number; plays: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const row = byDay.get(key)
    daily.push({ date: key, seconds: row?.seconds ?? 0, plays: row?.plays ?? 0 })
  }

  return {
    totalSeconds: totals?.totalSeconds ?? 0,
    totalPlays: totals?.totalPlays ?? 0,
    uniqueTracks: totals?.uniqueTracks ?? 0,
    topTracks: topTracks.map((e) => ({ ...e, track: { ...e.track, favourite: favSet.has(e.track.id) } })),
    topArtists,
    daily,
  }
})
