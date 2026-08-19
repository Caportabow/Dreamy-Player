import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { downloadJobs, tracks, userTracks } from '../db/schema'
import { getCurrentUser } from '../utils/auth'
import { env } from '../utils/env'
import { serviceAuthHeaders } from '../utils/service-auth'

const MAX_DURATION = 600

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
    itunesId?: string
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
      statusMessage: 'Only videos up to ten minutes long can be added.',
    })
  }

  const artworkUrl = typeof body.artworkUrl === 'string' ? body.artworkUrl.trim().slice(0, 1000) : ''
  // Apple track ids are plain positive integers; anything else is ignored.
  const itunesId =
    typeof body.itunesId === 'string' && /^\d{1,15}$/.test(body.itunesId)
      ? body.itunesId
      : null

  const sourceId = extractYoutubeId(sourceUrl)
  let existing: { id: string } | undefined
  if (sourceId) {
    existing = await db.query.tracks.findFirst({ where: eq(tracks.sourceId, sourceId) })
  }
  // Same song under a different YouTube upload — the catalog entry (and its
  // stored file) is reused as-is, nothing is re-downloaded.
  if (!existing && itunesId) {
    existing = await db.query.tracks.findFirst({ where: eq(tracks.itunesId, itunesId) })
  }
  if (existing) {
    // The song already lives in the shared catalog (someone else added it,
    // or this user did before). Add it to this user's library without
    // re-downloading anything — the stored file is reused as-is.
    const inLibrary = await db.query.userTracks.findFirst({
      where: and(eq(userTracks.userId, user.id), eq(userTracks.trackId, existing.id)),
    })
    if (inLibrary) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This song is already in your library.',
      })
    }
    await db.insert(userTracks).values({ userId: user.id, trackId: existing.id }).onConflictDoNothing()
    return { job: null, trackId: existing.id }
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
