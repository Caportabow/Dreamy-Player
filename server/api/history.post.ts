import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { playHistory, tracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

/**
 * The frontend only reports once meaningful listening has happened
 * (>= 20 seconds) and then periodically while playing. This endpoint
 * upserts the most recent unfinished play session for the track.
 */
export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const body = await readBody<{ trackId?: string; listenedSeconds?: number; completed?: boolean }>(event)

  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  const listenedSeconds = Math.min(Math.max(Math.round(Number(body.listenedSeconds) || 0), 0), 24 * 3600)
  const completed = body.completed === true

  if (!trackId) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  const track = await db.query.tracks.findFirst({ where: eq(tracks.id, trackId) })
  if (!track) throw createError({ statusCode: 404, statusMessage: 'Track not found.' })

  // Find the most recent unfinished play session for this user + track.
  const latest = await db.query.playHistory.findFirst({
    where: and(
      eq(playHistory.userId, user.id),
      eq(playHistory.trackId, trackId),
      eq(playHistory.completed, false),
    ),
    orderBy: desc(playHistory.playedAt),
  })

  if (latest) {
    await db
      .update(playHistory)
      .set({
        listenedSeconds: Math.max(latest.listenedSeconds, listenedSeconds),
        completed: latest.completed || completed,
        // This row is the user's most recent listening of the track — refresh
        // the timestamp so it surfaces at the top of “recent listening”.
        playedAt: new Date(),
      })
      .where(eq(playHistory.id, latest.id))
    return { recorded: true }
  }

  await db.insert(playHistory).values({
    id: randomUUID(),
    userId: user.id,
    trackId,
    listenedSeconds: Math.max(listenedSeconds, completed ? 1 : 0),
    completed,
  })

  return { recorded: true }
})
