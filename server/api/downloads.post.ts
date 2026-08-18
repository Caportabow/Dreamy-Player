import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { downloadJobs, tracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'
import { env } from '../utils/env'
import { serviceAuthHeaders } from '../utils/service-auth'

const MAX_DURATION = 300

export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/^\/shorts\/([^/?]+)/)
      if (m) return m[1]!
    }
    return null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)

  const body = await readBody<{
    sourceUrl?: string
    title?: string
    artist?: string
    duration?: number
    artworkUrl?: string
  }>(event)

  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : ''
  if (!sourceUrl || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(sourceUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'Please choose a valid YouTube result.' })
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, 200) : ''
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Missing track title.' })

  const duration = Number(body.duration)
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only videos up to five minutes long can be added.',
    })
  }

  const artworkUrl = typeof body.artworkUrl === 'string' ? body.artworkUrl.trim().slice(0, 1000) : ''

  const sourceId = extractYoutubeId(sourceUrl)
  if (sourceId) {
    const dup = await db.query.tracks.findFirst({ where: eq(tracks.sourceId, sourceId) })
    if (dup) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This song is already in the library.',
      })
    }
  }

  const jobId = randomUUID()
  await db.insert(downloadJobs).values({
    id: jobId,
    userId: user.id,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    query: title,
    sourceUrl,
    sourceId,
    title,
    artist,
    duration,
    artworkUrl: artworkUrl || null,
  })

  // Dispatch to the worker without blocking the response.
  dispatchToWorker(jobId, { sourceUrl, title, artist, duration, artworkUrl }).catch(async (err: any) => {
    console.error('[downloads] Failed to dispatch job', jobId, err)
    await db
      .update(downloadJobs)
      .set({
        status: 'failed',
        errorCode: 'service_unavailable',
        error: 'The download service could not be reached. Please try again.',
        finishedAt: new Date(),
      })
      .where(eq(downloadJobs.id, jobId))
  })

  const job = await db.query.downloadJobs.findFirst({ where: eq(downloadJobs.id, jobId) })
  return { job }
})

async function dispatchToWorker(
  jobId: string,
  payload: { sourceUrl: string; title: string; artist: string; duration: number; artworkUrl: string },
): Promise<void> {
  await $fetch(`${env.downloadServiceUrl}/download`, {
    method: 'POST',
    headers: serviceAuthHeaders(),
    body: { jobId, ...payload },
    timeout: 30_000,
  })
}
