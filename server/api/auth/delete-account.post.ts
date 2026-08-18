import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../db/schema'
import { clearSessionCookie, getCurrentUser } from '../../utils/auth'
import { env } from '../../utils/env'
import { removeObject } from '../../storage/minio'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)

  // Best-effort cleanup of the avatar object; the DB row is the source of truth.
  const avatarKey = user.profile?.avatarKey
  if (avatarKey) {
    try {
      await removeObject(env.buckets.avatars, avatarKey)
    } catch {
      // An orphaned object is harmless; never block account deletion on it.
    }
  }

  // Every user-owned row (sessions, passkeys, profile, playlists + their
  // tracks, favourites, play history, player state, download jobs, library
  // memberships) cascades on user delete. Tracks themselves are shared
  // catalog entries and stay, with `addedBy` set to null.
  await db.delete(users).where(eq(users.id, user.id))

  clearSessionCookie(event)
  return { ok: true }
})
