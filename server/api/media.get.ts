import { bucketForKey, getObjectStream } from '../storage/minio'

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

// Only allow keys that look like our own generated keys.
const KEY_PATTERN = /^(audio|artwork|avatars)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const key = typeof query.key === 'string' ? query.key : ''

  if (!key || !KEY_PATTERN.test(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key.' })
  }

  const bucket = bucketForKey(key)
  if (!bucket) throw createError({ statusCode: 400, statusMessage: 'Invalid media key.' })

  const stream = await getObjectStream(bucket, key)
  if (!stream) throw createError({ statusCode: 404, statusMessage: 'Media not found.' })

  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  setResponseHeader(event, 'content-type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')

  return sendStream(event, stream)
})
