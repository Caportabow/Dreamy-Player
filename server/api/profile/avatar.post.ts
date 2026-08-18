import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../../db'
import { profiles } from '../../db/schema'
import { getCurrentUser } from '../../utils/auth'
import { env } from '../../utils/env'
import { putObject, storageKeys } from '../../storage/minio'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function extForType(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const form = await readMultipartFormData(event)

  const file = form?.find((part) => part.name === 'avatar')
  if (!file || !file.data || file.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Please choose an image to upload.' })
  }
  if (file.data.length > MAX_AVATAR_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Avatar images must be smaller than 2 MB.' })
  }
  const type = file.type || 'image/jpeg'
  if (!ALLOWED_TYPES.includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Please upload a JPEG, PNG, or WebP image.' })
  }

  const ext = extForType(type)
  // A fresh key per upload avoids browser caching staleness.
  const key = storageKeys.avatar(`${user.id}-${randomUUID().slice(0, 8)}`, ext)
  await putObject(env.buckets.avatars, key, file.data, type)

  await db
    .update(profiles)
    .set({ avatarKey: key, updatedAt: new Date() })
    .where(eq(profiles.userId, user.id))

  return { user: { ...user, profile: { ...user.profile, avatarKey: key } } }
})
