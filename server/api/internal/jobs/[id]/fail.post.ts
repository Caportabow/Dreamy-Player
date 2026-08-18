import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { downloadJobs } from '../../../../db/schema'
import { requireServiceAuth } from '../../../../utils/service-auth'

export default defineEventHandler(async (event) => {
  requireServiceAuth(event)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing job id.' })

  const body = await readBody<{ error?: string; errorCode?: string }>(event)

  await db
    .update(downloadJobs)
    .set({
      status: 'failed',
      error: typeof body.error === 'string' ? body.error.slice(0, 2000) : 'The download failed.',
      errorCode: typeof body.errorCode === 'string' ? body.errorCode.slice(0, 80) : 'download_failure',
      finishedAt: new Date(),
    })
    .where(eq(downloadJobs.id, jobId))

  return { ok: true }
})
