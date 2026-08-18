import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../db/schema'
import { createSession, setSessionCookie, type AuthUser } from '../../utils/auth'
import { verifyPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Please enter your email and password.' })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
    with: { profile: true },
  })

  // Verify against a dummy hash when the user is missing, to keep timing uniform.
  const valid = user ? await verifyPassword(password, user.passwordHash) : false
  if (!user || !valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'That email and password combination does not match.',
    })
  }

  const token = await createSession(user.id)
  setSessionCookie(event, token)

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    profile: user.profile
      ? { displayName: user.profile.displayName, avatarKey: user.profile.avatarKey }
      : null,
  }
  return { user: authUser }
})
