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
  mbid: string | null
  matched: boolean
  url: string
}

export default defineEventHandler(async (event) => {
  await getCurrentUser(event)

  const body = await readBody<{ query?: string }>(event)
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : ''
  if (!query) throw createError({ statusCode: 400, statusMessage: 'What would you like to search for?' })

  async function askWorker(): Promise<SearchResult[]> {
    const res = await $fetch<{ results: SearchResult[] }>(`${env.downloadServiceUrl}/search`, {
      method: 'POST',
      headers: serviceAuthHeaders(),
      body: { query },
      timeout: 60_000,
    })
    return res.results ?? []
  }

  let results: SearchResult[] = []
  try {
    results = await askWorker()
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
    // No real answer — likely a transient hiccup (YouTube, MusicBrainz, or
    // the worker itself). Give it one more chance before telling the user.
    try {
      results = await askWorker()
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'The search hit a snag — please give it another try in a moment.',
      })
    }
  }

  // Enforce the ten-minute rule server-side as well.
  const filtered = results.filter((r) => Number.isInteger(r.duration) && r.duration >= 1 && r.duration <= 600)

  return { results: filtered }
})
