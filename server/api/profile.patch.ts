import { eq } from 'drizzle-orm'
import { db } from '../db'
import { profiles } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const body = await readBody<{ displayName?: string }>(event)

  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 40) : undefined

  if (displayName === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update.' })
  }

  await db
    .update(profiles)
    .set({ displayName: displayName || null, updatedAt: new Date() })
    .where(eq(profiles.userId, user.id))

  return { user: { ...user, profile: { ...user.profile, displayName: displayName || null } } }
})
