import { defineStore } from 'pinia'
import type { Track } from '~/types/music'
import { useAuthStore } from './auth'
import { usePlayerStore } from './player'

export type TrackSort = 'added' | 'title' | 'artist'

export const useLibraryStore = defineStore('library', () => {
  const tracks = ref<Track[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const search = ref('')
  const sort = ref<TrackSort>('added')
  const order = ref<'asc' | 'desc'>('desc')
  const loaded = ref(false)

  const auth = useAuthStore()
  const favouriteIds = ref<Set<string>>(new Set())

  const sortedTracks = computed(() => tracks.value)

  function sortKey(): string {
    return sort.value === 'added' ? 'added' : sort.value
  }

  async function fetchTracks(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ tracks: Track[]; total: number }>('/api/tracks', {
        query: {
          search: search.value || undefined,
          sort: sortKey(),
          order: order.value,
          limit: 200,
        },
      })
      tracks.value = res.tracks
      total.value = res.total
      favouriteIds.value = new Set(res.tracks.filter((t) => t.favourite).map((t) => t.id))
      loaded.value = true
    } catch {
      error.value = 'The library could not be loaded right now.'
    } finally {
      loading.value = false
    }
  }

  function toggleFavouriteLocal(trackId: string, favourite: boolean): void {
    const next = new Set(favouriteIds.value)
    if (favourite) next.add(trackId)
    else next.delete(trackId)
    favouriteIds.value = next
    const t = tracks.value.find((x) => x.id === trackId)
    if (t) t.favourite = favourite
  }

  async function addFavourite(trackId: string): Promise<boolean> {
    if (!auth.isSignedIn) return false
    try {
      await $fetch('/api/favourites', { method: 'POST', body: { trackId } })
      toggleFavouriteLocal(trackId, true)
      return true
    } catch {
      return false
    }
  }

  async function removeFavourite(trackId: string): Promise<boolean> {
    if (!auth.isSignedIn) return false
    try {
      await $fetch(`/api/favourites/${trackId}`, { method: 'DELETE' })
      toggleFavouriteLocal(trackId, false)
      return true
    } catch {
      return false
    }
  }

  async function toggleFavourite(track: Track): Promise<boolean> {
    if (track.favourite) return removeFavourite(track.id)
    return addFavourite(track.id)
  }

  /** Remove a song from this user's library (server also purges the shared
   *  catalog entry when nobody else holds it). */
  async function removeTrack(track: Track): Promise<boolean> {
    if (!auth.isSignedIn) return false
    try {
      await $fetch(`/api/tracks/${track.id}`, { method: 'DELETE' })
      tracks.value = tracks.value.filter((t) => t.id !== track.id)
      total.value = Math.max(0, total.value - 1)
      toggleFavouriteLocal(track.id, false)
      // Drop it from the playback queue — its file may be gone if the catalog
      // entry was purged, so it can no longer be played.
      const player = usePlayerStore()
      const idx = player.queue.findIndex((q) => q.id === track.id)
      if (idx >= 0) player.removeFromQueue(idx)
      return true
    } catch {
      return false
    }
  }

  /** Called by the downloads store when a job completes. */
  function touch(): void {
    if (loaded.value) fetchTracks()
  }

  return {
    tracks,
    total,
    loading,
    error,
    search,
    sort,
    order,
    loaded,
    favouriteIds,
    sortedTracks,
    fetchTracks,
    addFavourite,
    removeFavourite,
    toggleFavourite,
    toggleFavouriteLocal,
    removeTrack,
    touch,
  }
})
