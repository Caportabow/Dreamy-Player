import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { profiles, users } from '../../db/schema'
import { createSession, setSessionCookie, toAuthUser } from '../../utils/auth'
import { hashPassword, validatePassword, validateUsername } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)

  // Usernames are unique and compared case-insensitively (stored lowercased);
  // the display name keeps the casing the user chose.
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const usernameError = validateUsername(username)
  if (usernameError) throw createError({ statusCode: 400, statusMessage: usernameError })
  const passwordError = validatePassword(password)
  if (passwordError) throw createError({ statusCode: 400, statusMessage: passwordError })

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'That username is already taken.' })
  }

  const userId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, username, passwordHash: await hashPassword(password) })
    await tx.insert(profiles).values({ userId, displayName: username })
  })

  const token = await createSession(userId)
  setSessionCookie(event, token)

  return { user: toAuthUser({ id: userId, username, profile: { displayName: username, avatarKey: null } }) }
})
