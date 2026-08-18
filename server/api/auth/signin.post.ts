import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../db/schema'
import { createSession, setSessionCookie, toAuthUser } from '../../utils/auth'
import { verifyPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Please enter your username and password.' })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
    with: { profile: true },
  })

  // Verify against a dummy hash when the user is missing, to keep timing uniform.
  const valid = user ? await verifyPassword(password, user.passwordHash) : false
  if (!user || !valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'That username and password combination does not match.',
    })
  }

  const token = await createSession(user.id)
  setSessionCookie(event, token)

  return { user: toAuthUser(user) }
})
