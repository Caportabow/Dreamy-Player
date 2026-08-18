import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { profiles, users } from '../../db/schema'
import { createSession, setSessionCookie, type AuthUser } from '../../utils/auth'
import { hashPassword, validateEmail, validatePassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const emailError = validateEmail(email)
  if (emailError) throw createError({ statusCode: 400, statusMessage: emailError })
  const passwordError = validatePassword(password)
  if (passwordError) throw createError({ statusCode: 400, statusMessage: passwordError })

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'An account with that email already exists.' })
  }

  const userId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email, passwordHash: await hashPassword(password) })
    await tx.insert(profiles).values({
      userId,
      displayName: email.split('@')[0] || 'Dreamer',
    })
  })

  const token = await createSession(userId)
  setSessionCookie(event, token)

  const user: AuthUser = {
    id: userId,
    email,
    profile: { displayName: email.split('@')[0] || 'Dreamer', avatarKey: null },
  }
  return { user }
})
