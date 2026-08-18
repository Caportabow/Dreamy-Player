import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../db/schema'
import { validateUsername } from '../../utils/password'

// Live username check while typing — used by signup and the profile username
// editor. Public on purpose: guests must be able to check before registering.
// Format errors return 200 with { valid: false, error } so the client can show
// the exact same message the signup endpoint would produce.
export default defineEventHandler(async (event) => {
  const raw = getQuery(event).username
  const username = typeof raw === 'string' ? raw.trim().toLowerCase() : ''

  if (!username) return { valid: false, error: 'Enter a username.' }

  const usernameError = validateUsername(username)
  if (usernameError) return { valid: false, error: usernameError }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  return { valid: true, taken: existing.length > 0 }
})
