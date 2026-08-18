import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { downloadJobs } from '../../../../db/schema'
import { requireServiceAuth } from '../../../../utils/service-auth'

const TERMINAL = new Set(['complete', 'failed'])

export default defineEventHandler(async (event) => {
  requireServiceAuth(event)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing job id.' })

  const body = await readBody<{
    status?: string
    stage?: string
    progress?: number
    error?: string
    errorCode?: string
  }>(event)

  const job = await db.query.downloadJobs.findFirst({ where: eq(downloadJobs.id, jobId) })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found.' })
  if (TERMINAL.has(job.status)) return { ok: true }

  const progress =
    typeof body.progress === 'number' ? Math.min(Math.max(Math.round(body.progress), 0), 100) : undefined
  const status = typeof body.status === 'string' && body.status.length > 0 ? body.status.slice(0, 40) : undefined
  const stage = typeof body.stage === 'string' && body.stage.length > 0 ? body.stage.slice(0, 80) : undefined
  const error = typeof body.error === 'string' && body.error.length > 0 ? body.error.slice(0, 2000) : undefined
  const errorCode =
    typeof body.errorCode === 'string' && body.errorCode.length > 0 ? body.errorCode.slice(0, 80) : undefined

  await db
    .update(downloadJobs)
    .set({
      ...(status ? { status } : {}),
      ...(stage ? { stage } : {}),
      ...(progress !== undefined ? { progress } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(errorCode !== undefined ? { errorCode } : {}),
      ...(job.startedAt ? {} : { startedAt: new Date() }),
      ...(status === 'complete' || status === 'failed' ? { finishedAt: new Date() } : {}),
    })
    .where(eq(downloadJobs.id, jobId))

  return { ok: true }
})
