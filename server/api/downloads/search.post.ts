import { getCurrentUser } from '../../utils/auth'
import { env } from '../../utils/env'
import { serviceAuthHeaders } from '../../utils/service-auth'

interface SearchResult {
  id: string
  title: string
  artist: string
  album: string | null
  duration: number
  thumbnail: string | null
  artworkUrl: string | null
  previewUrl: string | null
  itunesId: string | null
  matched: boolean
  url: string
}

interface SearchPage {
  results: SearchResult[]
  hasMore?: boolean
}

export default defineEventHandler(async (event) => {
  await getCurrentUser(event)

  const body = await readBody<{ query?: string; page?: number }>(event)
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : ''
  if (!query) throw createError({ statusCode: 400, statusMessage: 'What would you like to search for?' })
  const page = Math.min(Math.max(Number(body.page) || 1, 1), 20)

  async function askWorker(): Promise<SearchPage> {
    const res = await $fetch<SearchPage>(`${env.downloadServiceUrl}/search`, {
      method: 'POST',
      headers: serviceAuthHeaders(),
      body: { query, page },
      timeout: 60_000,
    })
    return { results: res.results ?? [], hasMore: res.hasMore }
  }

  let pageResult: SearchPage = { results: [] }
  try {
    pageResult = await askWorker()
  } catch (err: any) {
    // Surface the worker's real reason (no results, blocked, too long, …)
    // instead of a generic outage message that hides the cause.
    const message = err?.data?.message
    const status = err?.statusCode || err?.response?.status
    if (typeof message === 'string' && message) {
      throw createError({
        statusCode: status === 422 ? 422 : 503,
        statusMessage: message,
      })
    }
    // No real answer — likely a transient hiccup (YouTube, iTunes, or the
    // worker itself). Give it one more chance before telling the user.
    try {
      pageResult = await askWorker()
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'The search hit a snag — please give it another try in a moment.',
      })
    }
  }

  // Enforce the ten-minute rule server-side as well.
  const filtered = pageResult.results.filter(
    (r) => Number.isInteger(r.duration) && r.duration >= 1 && r.duration <= 600,
  )

  return { results: filtered, hasMore: pageResult.hasMore ?? false }
})
