import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { favourites, playlistTracks, playlists, tracks } from '../../db/schema'
import { getOwnedPlaylist } from '../../utils/playlists'

export default defineEventHandler(async (event) => {
  const playlistId = getRouterParam(event, 'id')
  if (!playlistId) throw createError({ statusCode: 400, statusMessage: 'Missing playlist id.' })

  const { user } = await getOwnedPlaylist(event, playlistId)

  const entries = await db
    .select({ entry: playlistTracks, track: tracks })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(asc(playlistTracks.position))

  let favouriteIds = new Set<string>()
  if (entries.length > 0) {
    const favs = await db
      .select({ trackId: favourites.trackId })
      .from(favourites)
      .where(
        and(eq(favourites.userId, user.id), inArray(favourites.trackId, entries.map((e) => e.track.id))),
      )
    favouriteIds = new Set(favs.map((f) => f.trackId))
  }

  const playlist = await db.query.playlists.findFirst({
    where: eq(playlists.id, playlistId),
  })

  return {
    playlist,
    tracks: entries.map((e) => ({ ...e.track, favourite: favouriteIds.has(e.track.id) })),
  }
})
