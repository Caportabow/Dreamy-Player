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
  const jobs = ref<DownloadJob[]>([])
  const loadingJobs = ref(false)
  const creating = ref(false)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastCompleteIds = new Set<string>()
  let started = false

  const activeJobs = computed(() => jobs.value.filter((j) => ACTIVE_STATUSES.has(j.status)))
  const hasActiveJobs = computed(() => activeJobs.value.length > 0)

  async function search(query: string): Promise<SearchResult[]> {
    searching.value = true
    searchError.value = null
    try {
      const res = await $fetch<{ results: SearchResult[] }>('/api/downloads/search', {
        method: 'POST',
        body: { query },
      })
      results.value = res.results
      return res.results
    } catch (err: any) {
      searchError.value = err?.data?.message || 'Searching is not available right now.'
      results.value = []
      return []
    } finally {
      searching.value = false
    }
  }

  async function createJob(selection: {
    sourceUrl: string
    title: string
    artist: string
    duration: number
    artworkUrl: string
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

  function detectCompletions(next: DownloadJob[]): void {
    const completedNow = new Set(
      next.filter((j) => j.status === 'complete').map((j) => j.id),
    )
    const freshlyComplete = [...completedNow].filter((id) => !lastCompleteIds.has(id))
    if (freshlyComplete.length > 0) {
      library.touch()
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
  }

  return {
    searching,
    searchError,
    results,
    jobs,
    loadingJobs,
    creating,
    activeJobs,
    hasActiveJobs,
    search,
    createJob,
    fetchJobs,
    ensurePolling,
    stopPolling,
    reset,
  }
})
