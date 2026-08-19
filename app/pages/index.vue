<script setup lang="ts">
import { ArrowDownUp, Search, X } from 'lucide-vue-next'
import type { SearchResult } from '~/types/music'
import { useLibraryStore } from '~/stores/library'
import { useDownloadsStore } from '~/stores/downloads'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const library = useLibraryStore()
const downloads = useDownloadsStore()
const toast = useToast()

const searchInput = ref('')
const addingId = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let lastSearchQuery = ''

const sortOptions = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
]

/** Search the download service for songs that could be added to the library. */
function runRemoteSearch(): void {
  const q = searchInput.value.trim()
  if (!q) {
    downloads.reset()
    lastSearchQuery = ''
    return
  }
  // Searching is slow; don't re-ask for the same query that's already on
  // screen (the Try again button handles retries after an error).
  if (q === lastSearchQuery) return
  lastSearchQuery = q
  void downloads.search(q)
}

function retrySearch(): void {
  const q = searchInput.value.trim()
  if (!q || downloads.searching) return
  void downloads.search(q)
}

watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    library.search = searchInput.value
    library.fetchTracks()
    runRemoteSearch()
  }, 300)
})

async function addResult(result: SearchResult): Promise<void> {
  if (addingId.value) return
  addingId.value = result.id
  try {
    const { job, addedTrackId } = await downloads.createJob({
      sourceUrl: result.url,
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      artworkUrl: result.artworkUrl || result.thumbnail || '',
      itunesId: result.itunesId,
    })
    if (addedTrackId) {
      toast.success('This song was already saved — added to your library.')
    }
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'The download could not be started.'))
  } finally {
    addingId.value = null
  }
}

function focusSearch(): void {
  document.getElementById('library-search')?.focus()
}

/** One click back to the library: clear the query, results, and filters. */
function clearSearch(): void {
  searchInput.value = ''
  if (searchTimer) clearTimeout(searchTimer)
  downloads.reset()
  lastSearchQuery = ''
  library.search = ''
  void library.fetchTracks()
}

function changeSort(value: string): void {
  library.sort = value as 'added' | 'title' | 'artist'
  library.fetchTracks()
}

function toggleOrder(): void {
  library.order = library.order === 'desc' ? 'asc' : 'desc'
  library.fetchTracks()
}

// Job polling lives in app.vue now — this page only loads the library.
onMounted(() => {
  void library.fetchTracks()
})

useHead({ title: 'Library' })
</script>

<template>
  <div class="animate-fade-in">
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="font-display text-2xl font-semibold text-cream sm:text-3xl">Library</h1>
        <p class="mt-1 text-sm text-cream-dim">
          {{ library.total }} {{ library.total === 1 ? 'song' : 'songs' }} resting in the collection
        </p>
      </div>

      <div class="flex items-center gap-2">
        <div class="relative flex-1 sm:w-72">
          <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
          <Input
            id="library-search"
            v-model="searchInput"
            type="search"
            placeholder="Search songs, artists, albums…"
            class="pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
            aria-label="Search songs to play or add"
          />
          <button
            v-if="searchInput"
            type="button"
            class="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-cream-faint transition-colors hover:bg-white/10 hover:text-cream"
            aria-label="Clear search and return to the library"
            title="Clear search"
            @click="clearSearch"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <div class="relative">
          <select
            :value="library.sort"
            class="input-soft w-auto cursor-pointer appearance-none pr-9"
            aria-label="Sort tracks"
            @change="changeSort(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <ArrowDownUp class="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream-faint" />
        </div>
      </div>
    </header>

    <!-- add new songs: search the catalog while the query is active -->
    <div
      v-if="
        searchInput.trim() &&
        (downloads.searching || downloads.results.length > 0 || downloads.searchError)
      "
      class="mb-8"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium text-cream-muted">Add new songs</h2>
      </div>

      <div
        v-if="downloads.searchError"
        class="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm text-rose-200/90"
      >
        <span>{{ downloads.searchError }}</span>
        <Button variant="ghost" size="sm" :disabled="downloads.searching" @click="retrySearch">
          Try again
        </Button>
      </div>

      <!-- searching animation -->
      <div
        v-if="downloads.searching && downloads.results.length === 0"
        class="flex animate-fade-in flex-col items-center gap-3 rounded-pillow-lg border border-dashed border-white/6 bg-white/2 py-10"
      >
        <div class="relative flex h-14 w-14 items-center justify-center">
          <span class="absolute inset-0 animate-breathe rounded-full bg-lavender-400/15" />
          <span
            class="absolute inset-1 animate-spin-slow rounded-full border border-lavender-400/25"
            style="border-top-color: transparent; border-right-color: transparent"
          />
          <Equalizer active class="h-5" />
        </div>
        <p class="text-sm text-cream-dim">Searching for “{{ searchInput.trim() }}”…</p>
      </div>

      <!-- results, gently staggered -->
      <div v-else-if="downloads.results.length > 0" class="flex flex-col gap-2.5">
        <div
          v-for="(result, i) in downloads.results"
          :key="result.id"
          class="animate-fade-in-up"
          :style="{ animationDelay: `${Math.min(i, 5) * 60}ms` }"
        >
          <SearchResultCard
            :result="result"
            add
            :busy="addingId === result.id"
            @add="addResult"
          />
        </div>
      </div>

      <p v-else-if="!downloads.searching" class="py-6 text-center text-sm text-cream-dim">
        No new songs found for “{{ searchInput }}”.
      </p>
    </div>

    <!-- loading skeleton -->
    <div v-if="library.loading && library.tracks.length === 0" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <div v-for="i in 10" :key="i" class="pillow-card p-3">
        <Skeleton class="mb-3 aspect-square w-full rounded-pillow-sm" />
        <Skeleton class="mb-2 h-4 w-3/4" />
        <Skeleton class="h-3 w-1/2" />
      </div>
    </div>

    <!-- error -->
    <EmptyState
      v-else-if="library.error && library.tracks.length === 0"
      title="The library is dozing off"
      description="We couldn't reach it just now. Give it a nudge and try again."
    >
      <Button @click="library.fetchTracks()">Try again</Button>
    </EmptyState>

    <!-- empty library (only when not searching) -->
    <EmptyState
      v-else-if="library.tracks.length === 0 && !searchInput.trim()"
      title="A quiet room, so far"
      description="Search for a song — if it isn't in your library yet, you can add it right from the results."
    >
      <Button @click="focusSearch">Search for songs</Button>
    </EmptyState>

    <!-- grid -->
    <div v-else-if="library.tracks.length > 0" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <TrackCard v-for="track in library.sortedTracks" :key="track.id" :track="track" :list="library.sortedTracks" />
    </div>

    <!-- searching, but nothing in the library matches -->
    <p
      v-else-if="library.search && !library.loading"
      class="py-10 text-center text-sm text-cream-dim"
    >
      No songs in your library match “{{ library.search }}”.
    </p>
  </div>
</template>
