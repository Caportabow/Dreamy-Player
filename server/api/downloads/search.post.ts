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
    // The worker can legitimately take a while (YouTube + iTunes); give it
    // room to finish in one shot instead of aborting and re-firing. If the
    // client gives up meanwhile (a new keystroke fires a fresh search, or a
    // navigation), abort the worker request so it stops burning YouTube and
    // iTunes budget on a search nobody will see.
    const controller = new AbortController()
    event.node.res.on('close', () => controller.abort())
    const res = await $fetch<SearchPage>(`${env.downloadServiceUrl}/search`, {
      method: 'POST',
      headers: serviceAuthHeaders(),
      body: { query, page },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
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
    // Aborted: either the client disconnected (new keystroke/navigation) or
    // the worker exceeded the search budget. Re-firing is pointless in both
    // cases — a timeout means the worker is still chewing through a slow
    // search, and another request would just double the YouTube load.
    const aborted =
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      err?.cause?.name === 'AbortError' ||
      err?.cause?.name === 'TimeoutError'
    if (aborted) {
      throw createError({
        statusCode: 504,
        statusMessage: 'The search is taking longer than usual — please try again in a moment.',
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
