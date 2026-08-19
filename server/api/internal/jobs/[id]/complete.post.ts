import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { downloadJobs, tracks, userTracks } from '../../../../db/schema'
import { requireServiceAuth } from '../../../../utils/service-auth'
import { bucketForKey, removeObject } from '../../../../storage/minio'

const MAX_DURATION = 600

export default defineEventHandler(async (event) => {
  requireServiceAuth(event)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing job id.' })

  const body = await readBody<{
    id?: string
    title?: string
    artist?: string
    album?: string | null
    itunesId?: string | null
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
  const album = typeof body.album === 'string' && body.album.trim() ? body.album.trim().slice(0, 300) : null
  // Apple track ids are plain positive integers; anything else is ignored.
  const itunesId =
    typeof body.itunesId === 'string' && /^\d{1,15}$/.test(body.itunesId)
      ? body.itunesId
      : null
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
      statusMessage: 'Rejected track: duration is missing or longer than ten minutes.',
    })
  }
  if (!audioKey.startsWith('audio/')) {
    throw createError({ statusCode: 400, statusMessage: 'Rejected track: invalid audio key.' })
  }

  // If the same song was added while this job was running, reuse that catalog
  // entry — the song must never be stored twice. First by exact YouTube video,
  // then by iTunes track id (same song, different upload).
  let trackId: string | null = null
  let existingAudioKey: string | null = null
  if (sourceId) {
    const existing = await db.query.tracks.findFirst({ where: eq(tracks.sourceId, sourceId) })
    if (existing) {
      trackId = existing.id
      existingAudioKey = existing.audioKey
    }
  }
  if (!trackId && itunesId) {
    const existing = await db.query.tracks.findFirst({ where: eq(tracks.itunesId, itunesId) })
    if (existing) {
      trackId = existing.id
      existingAudioKey = existing.audioKey
    }
  }
  if (trackId) {
    // This job's freshly uploaded audio is now redundant — remove it.
    if (audioKey && audioKey !== existingAudioKey) {
      const bucket = bucketForKey(audioKey)
      if (bucket) {
        await removeObject(bucket, audioKey).catch(() => {})
      }
    }
  } else {
    trackId = typeof body.id === 'string' && body.id ? body.id : randomUUID()
    await db.insert(tracks).values({
      id: trackId,
      title,
      artist,
      album,
      itunesId,
      duration,
      audioKey,
      artworkKey,
      sourceUrl,
      sourceId,
      addedBy: job.userId,
    })
  }

  // Every completed job adds the song to its owner's library.
  await db.insert(userTracks).values({ userId: job.userId, trackId }).onConflictDoNothing()

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
