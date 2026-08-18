import { eq } from 'drizzle-orm'
import { db } from '../db'
import { profiles, users } from '../db/schema'
import { getCurrentUser, toAuthUser } from '../utils/auth'
import { validateUsername } from '../utils/password'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const body = await readBody<{ displayName?: string; username?: string }>(event)

  if (body.displayName !== undefined && body.username !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Update one field at a time.' })
  }
  if (body.displayName === undefined && body.username === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update.' })
  }

  let username = user.username
  let profile = user.profile

  if (body.username !== undefined) {
    // Usernames are unique and compared case-insensitively (stored lowercased).
    const next = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const usernameError = validateUsername(next)
    if (usernameError) throw createError({ statusCode: 400, statusMessage: usernameError })

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, next))
      .limit(1)
    if (existing.length > 0 && existing[0].id !== user.id) {
      throw createError({ statusCode: 409, statusMessage: 'That username is already taken.' })
    }

    await db.update(users).set({ username: next }).where(eq(users.id, user.id))
    username = next
  }

  if (body.displayName !== undefined) {
    const displayName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 40) : undefined

    await db
      .update(profiles)
      .set({ displayName: displayName || null, updatedAt: new Date() })
      .where(eq(profiles.userId, user.id))

    profile = { displayName: displayName || null, avatarKey: user.profile?.avatarKey ?? null }
  }

  return { user: toAuthUser({ id: user.id, username, profile }) }
})
