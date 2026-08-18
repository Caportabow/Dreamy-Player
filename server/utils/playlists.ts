import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../db'
import { playlists } from '../db/schema'
import { getCurrentUser } from './auth'

/**
 * Resolve the current user, load the playlist, and verify ownership.
 * Returns the playlist row (guaranteed owned by the current user).
 */
export async function getOwnedPlaylist(event: H3Event, playlistId: string) {
  const user = await getCurrentUser(event)
  const playlist = await db.query.playlists.findFirst({
    where: and(eq(playlists.id, playlistId), eq(playlists.userId, user.id)),
  })
  if (!playlist) {
    throw createError({ statusCode: 404, statusMessage: 'Playlist not found.' })
  }
  return { user, playlist }
}
