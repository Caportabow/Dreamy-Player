import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { downloadJobs, tracks } from '../../../../db/schema'
import { requireServiceAuth } from '../../../../utils/service-auth'

const MAX_DURATION = 300

export default defineEventHandler(async (event) => {
  requireServiceAuth(event)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing job id.' })

  const body = await readBody<{
    id?: string
    title?: string
    artist?: string
    duration?: number
    audioKey?: string
    artworkKey?: string | null
    sourceUrl?: string
    sourceId?: string | null
  }>(event)

  const job = await db.query.downloadJobs.findFirst({ where: eq(downloadJobs.id, jobId) })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found.' })

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, 200) : ''
  const duration = Number(body.duration)
  const audioKey = typeof body.audioKey === 'string' ? body.audioKey : ''
  const artworkKey = typeof body.artworkKey === 'string' && body.artworkKey ? body.artworkKey : null
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : (job.sourceUrl || '')
  const sourceId = typeof body.sourceId === 'string' && body.sourceId ? body.sourceId : job.sourceId

  // The worker must never be trusted blindly — re-validate everything.
  if (!title || !artist) {
    throw createError({ statusCode: 400, statusMessage: 'Worker sent incomplete track metadata.' })
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rejected track: duration is missing or longer than five minutes.',
    })
  }
  if (!audioKey.startsWith('audio/')) {
    throw createError({ statusCode: 400, statusMessage: 'Rejected track: invalid audio key.' })
  }

  const trackId = typeof body.id === 'string' && body.id ? body.id : randomUUID()

  const existing = await db.query.tracks.findFirst({ where: eq(tracks.id, trackId) })
  if (!existing) {
    await db.insert(tracks).values({
      id: trackId,
      title,
      artist,
      duration,
      audioKey,
      artworkKey,
      sourceUrl,
      sourceId,
      addedBy: job.userId,
    })
  }

  await db
    .update(downloadJobs)
    .set({
      status: 'complete',
      stage: 'complete',
      progress: 100,
      trackId,
      title,
      artist,
      duration,
      finishedAt: new Date(),
    })
    .where(eq(downloadJobs.id, jobId))

  return { ok: true, trackId }
})
