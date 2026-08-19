import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { favourites, playlistTracks, tracks, userTracks } from '../../db/schema'
import { getCurrentUser } from '../../utils/auth'
import { bucketForKey, removeObject } from '../../storage/minio'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing track id.' })

  const track = await db.query.tracks.findFirst({ where: eq(tracks.id, id) })
  if (!track) throw createError({ statusCode: 404, statusMessage: 'This song is not in the library.' })

  // 1. Remove this user's membership in the shared catalog.
  await db
    .delete(userTracks)
    .where(and(eq(userTracks.userId, user.id), eq(userTracks.trackId, id)))

  // 2. A favourite only makes sense while the song is in this library.
  await db
    .delete(favourites)
    .where(and(eq(favourites.userId, user.id), eq(favourites.trackId, id)))

  // 3. If nobody else has this song, the shared catalog entry is now orphaned.
  //    Soft-delete it: the row (and its artwork) stays so play history and
  //    statistics keep rendering the song — only the audio file is freed, and
  //    the song leaves every playlist and favourite. This must never erase
  //    anyone's listening history.
  const remaining = await db
    .select({ userId: userTracks.userId })
    .from(userTracks)
    .where(eq(userTracks.trackId, id))
    .limit(1)

  let purged = false
  if (remaining.length === 0) {
    await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, id))
    await db.delete(playlistTracks).where(eq(playlistTracks.trackId, id))
    await db.delete(favourites).where(eq(favourites.trackId, id))
    purged = true
    // The audio is the storage cost worth freeing; the artwork (a few KB) is
    // kept so deleted songs still show their cover in history/statistics.
    if (track.audioKey) {
      const bucket = bucketForKey(track.audioKey)
      if (bucket) await removeObject(bucket, track.audioKey).catch(() => {})
    }
  }

  return { removed: true, purged }
})
