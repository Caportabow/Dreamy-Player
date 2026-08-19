import { defineStore } from 'pinia'
import type { DownloadJob, SearchResult } from '~/types/music'
import { useAuthStore } from './auth'
import { useLibraryStore } from './library'

const ACTIVE_STATUSES = new Set(['queued', 'searching', 'downloading', 'converting', 'uploading'])
const POLL_INTERVAL = 2500

export const useDownloadsStore = defineStore('downloads', () => {
  const auth = useAuthStore()
  const library = useLibraryStore()

  const searching = ref(false)
  const searchError = ref<string | null>(null)
  const results = ref<SearchResult[]>([])
  /** Whether YouTube may have more results beyond the current page. */
  const hasMore = ref(false)
  const loadingMore = ref(false)
  const jobs = ref<DownloadJob[]>([])
  const loadingJobs = ref(false)
  const creating = ref(false)
  /** Title of the most recently completed job — lets the UI show a brief "done" flash. */
  const completedTitle = ref<string | null>(null)
  let completedTimer: ReturnType<typeof setTimeout> | null = null

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastCompleteIds = new Set<string>()
  let started = false

  // Search requests are slow (10–30s: YouTube + enrichment), so a new search
  // can start while an older one is still in flight. Out-of-order responses
  // are ignored via a sequence counter, and stale requests are aborted.
  let searchSeq = 0
  let searchController: AbortController | null = null
  let currentQuery = ''
  let nextPage = 1

  const activeJobs = computed(() => jobs.value.filter((j) => ACTIVE_STATUSES.has(j.status)))
  const hasActiveJobs = computed(() => activeJobs.value.length > 0)

  async function search(query: string): Promise<SearchResult[]> {
    const seq = ++searchSeq
    searchController?.abort()
    searchController = new AbortController()
    searching.value = true
    searchError.value = null
    hasMore.value = false
    loadingMore.value = false
    currentQuery = query
    nextPage = 2
    // Drop stale results from a previous query while the new one is in flight.
    results.value = []
    try {
      const res = await $fetch<{ results: SearchResult[]; hasMore?: boolean }>('/api/downloads/search', {
        method: 'POST',
        body: { query, page: 1 },
        signal: searchController.signal,
      })
      if (seq !== searchSeq) return []
      results.value = res.results
      hasMore.value = res.hasMore ?? false
      return res.results
    } catch (err: any) {
      if (seq !== searchSeq) return []
      searchError.value = err?.data?.message || 'Searching is not available right now.'
      results.value = []
      return []
    } finally {
      if (seq === searchSeq) searching.value = false
    }
  }

  /** Fetch the next page of results for the current query and append them. */
  async function loadMore(): Promise<void> {
    if (loadingMore.value || searching.value || !hasMore.value || !currentQuery) return
    const seq = searchSeq
    const page = nextPage
    loadingMore.value = true
    try {
      const res = await $fetch<{ results: SearchResult[]; hasMore?: boolean }>('/api/downloads/search', {
        method: 'POST',
        body: { query: currentQuery, page },
      })
      // A new search (or query change) supersedes this page — discard it.
      if (seq !== searchSeq) return
      appendUnique(res.results)
      hasMore.value = res.hasMore ?? false
      nextPage = page + 1
    } catch {
      // Leave hasMore true so the user can simply try again.
    } finally {
      if (seq === searchSeq) loadingMore.value = false
    }
  }

  /** Append a page, skipping songs already on screen (same song, other uploads). */
  function appendUnique(next: SearchResult[]): void {
    const key = (r: SearchResult): string =>
      r.itunesId ?? `${r.artist.toLowerCase()}||${r.title.toLowerCase()}`
    const seen = new Set(results.value.map(key))
    results.value = [...results.value, ...next.filter((r) => !seen.has(key(r)))]
  }

  async function createJob(selection: {
    sourceUrl: string
    title: string
    artist: string
    duration: number
    artworkUrl: string
    itunesId: string | null
  }): Promise<{ job: DownloadJob | null; addedTrackId: string | null }> {
    creating.value = true
    try {
      const res = await $fetch<{ job: DownloadJob | null; trackId?: string }>('/api/downloads', {
        method: 'POST',
        body: selection,
      })
      if (res.job) {
        jobs.value.unshift(res.job)
        ensurePolling()
        return { job: res.job, addedTrackId: null }
      }
      // The song was already in the shared catalog — it was added to this
      // user's library instantly, no download job needed.
      if (res.trackId) library.touch()
      return { job: null, addedTrackId: res.trackId ?? null }
    } catch (err: any) {
      throw new Error(err?.data?.message || 'The download could not be started.')
    } finally {
      creating.value = false
    }
  }

  async function fetchJobs(): Promise<void> {
    if (!auth.isSignedIn) {
      jobs.value = []
      return
    }
    loadingJobs.value = true
    try {
      const res = await $fetch<{ jobs: DownloadJob[] }>('/api/downloads', { query: { limit: 20 } })
      jobs.value = res.jobs
      detectCompletions(res.jobs)
    } catch {
      // silent — polling will retry
    } finally {
      loadingJobs.value = false
    }
  }

  // Track completions *since the store was loaded*. On the very first fetch
  // (e.g. a page refresh) already-finished jobs are recorded silently, so the
  // "Added to your library" flash only fires for downloads that actually
  // completed while this session was watching.
  let primed = false

  function detectCompletions(next: DownloadJob[]): void {
    const completedNow = new Set(
      next.filter((j) => j.status === 'complete').map((j) => j.id),
    )
    if (!primed) {
      primed = true
      lastCompleteIds = completedNow
      return
    }
    const freshlyComplete = [...completedNow].filter((id) => !lastCompleteIds.has(id))
    if (freshlyComplete.length > 0) {
      library.touch()
      const done = next.find((j) => j.id === freshlyComplete[0])
      if (done?.title) {
        completedTitle.value = done.title
        if (completedTimer) clearTimeout(completedTimer)
        completedTimer = setTimeout(() => {
          completedTitle.value = null
        }, 4000)
      }
    }
    lastCompleteIds = completedNow
  }

  function ensurePolling(): void {
    if (started) return
    started = true
    pollTimer = setInterval(async () => {
      if (auth.isSignedIn) {
        await fetchJobs()
        if (!hasActiveJobs.value) stopPolling()
      }
    }, POLL_INTERVAL)
  }

  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    started = false
  }

  function reset(): void {
    results.value = []
    searchError.value = null
    hasMore.value = false
    loadingMore.value = false
    currentQuery = ''
    nextPage = 1
  }

  return {
    searching,
    searchError,
    results,
    hasMore,
    loadingMore,
    jobs,
    loadingJobs,
    creating,
    completedTitle,
    activeJobs,
    hasActiveJobs,
    search,
    loadMore,
    createJob,
    fetchJobs,
    ensurePolling,
    stopPolling,
    reset,
  }
})
