import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { downloadJobs } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50)

  const jobs = await db.query.downloadJobs.findMany({
    where: eq(downloadJobs.userId, user.id),
    orderBy: desc(downloadJobs.createdAt),
    limit,
    with: { track: true },
  })

  return { jobs }
})
