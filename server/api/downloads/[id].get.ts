import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { downloadJobs } from '../../db/schema'
import { getCurrentUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing job id.' })

  const job = await db.query.downloadJobs.findFirst({
    where: and(eq(downloadJobs.id, jobId), eq(downloadJobs.userId, user.id)),
    with: { track: true },
  })

  if (!job) throw createError({ statusCode: 404, statusMessage: 'Download job not found.' })
  return { job }
})
