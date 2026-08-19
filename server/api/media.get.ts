import { bucketForKey, getObjectPartial, getObjectStream, statObject } from '../storage/minio'

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

// Only allow keys that look like our own generated keys.
const KEY_PATTERN = /^(audio|artwork|avatars)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

interface ByteRange {
  start: number
  end: number
}

/** Parse `bytes=start-end`, `bytes=start-`, or `bytes=-suffix`. Null when absent or malformed. */
function parseRange(header: string | undefined, size: number): ByteRange | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const startStr = match[1] ?? ''
  const endStr = match[2] ?? ''
  if (startStr === '' && endStr === '') return null

  let start: number
  let end: number
  if (startStr === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(endStr)
    if (!Number.isFinite(suffix)) return null
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    start = Number(startStr)
    if (!Number.isFinite(start)) return null
    end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1)
  }
  if (start < 0 || end < start) return null
  return { start, end }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const key = typeof query.key === 'string' ? query.key : ''

  if (!key || !KEY_PATTERN.test(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid media key.' })
  }

  const bucket = bucketForKey(key)
  if (!bucket) throw createError({ statusCode: 400, statusMessage: 'Invalid media key.' })

  // statObject gives us the total size up front, which the audio element
  // needs to know the duration and expose a seekable range.
  const meta = await statObject(bucket, key)
  if (!meta) throw createError({ statusCode: 404, statusMessage: 'Media not found.' })

  const size = meta.size
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

  setResponseHeader(event, 'content-type', contentType)
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  setResponseHeader(event, 'accept-ranges', 'bytes')

  const rangeHeader = getHeader(event, 'range')

  if (rangeHeader) {
    const range = parseRange(rangeHeader, size)
    if (!range) {
      // Unsatisfiable — tell the client the object size so it can retry.
      setResponseStatus(event, 416)
      setResponseHeader(event, 'content-range', `bytes */${size}`)
      return null
    }
    const { start, end } = range
    setResponseStatus(event, 206)
    setResponseHeader(event, 'content-range', `bytes ${start}-${end}/${size}`)
    setResponseHeader(event, 'content-length', end - start + 1)
    const stream = await getObjectPartial(bucket, key, start, end - start + 1)
    if (!stream) throw createError({ statusCode: 404, statusMessage: 'Media not found.' })
    return sendStream(event, stream)
  }

  // No Range header — serve the whole object.
  setResponseHeader(event, 'content-length', size)
  const stream = await getObjectStream(bucket, key)
  if (!stream) throw createError({ statusCode: 404, statusMessage: 'Media not found.' })
  return sendStream(event, stream)
})
