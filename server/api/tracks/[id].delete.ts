import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { favourites, tracks, userTracks } from '../../db/schema'
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

  // 3. If nobody else has this song, the shared catalog entry is now orphaned
  //    — purge it (FKs cascade playlists, history, favourites) and remove the
  //    stored audio/artwork so nothing lingers on disk.
  const remaining = await db
    .select({ userId: userTracks.userId })
    .from(userTracks)
    .where(eq(userTracks.trackId, id))
    .limit(1)

  let purged = false
  if (remaining.length === 0) {
    await db.delete(tracks).where(eq(tracks.id, id))
    purged = true
    const removeFile = async (key: string | null): Promise<void> => {
      if (!key) return
      const bucket = bucketForKey(key)
      if (bucket) await removeObject(bucket, key).catch(() => {})
    }
    await Promise.all([removeFile(track.audioKey), removeFile(track.artworkKey)])
  }

  return { removed: true, purged }
})
