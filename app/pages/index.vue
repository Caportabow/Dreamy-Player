<script setup lang="ts">
import { ArrowDownUp, Search } from 'lucide-vue-next'
import { useLibraryStore } from '~/stores/library'
import { useDownloadsStore } from '~/stores/downloads'

const library = useLibraryStore()
const downloads = useDownloadsStore()

const searchInput = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

const sortOptions = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
]

watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    library.search = searchInput.value
    library.fetchTracks()
  }, 300)
})

function changeSort(value: string): void {
  library.sort = value as 'added' | 'title' | 'artist'
  library.fetchTracks()
}

function toggleOrder(): void {
  library.order = library.order === 'desc' ? 'asc' : 'desc'
  library.fetchTracks()
}

onMounted(async () => {
  await Promise.all([library.fetchTracks(), downloads.fetchJobs()])
  if (downloads.hasActiveJobs) downloads.ensurePolling()
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
            v-model="searchInput"
            type="search"
            placeholder="Search songs, artists, albums…"
            class="pl-10"
            aria-label="Search the library"
          />
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

    <!-- empty -->
    <EmptyState
      v-else-if="library.tracks.length === 0"
      title="A quiet room, so far"
      description="Nothing has been added yet. Search for a song under Add Music and it will appear here."
    >
      <NuxtLink :to="'/add'" class="btn-primary">Add your first song</NuxtLink>
    </EmptyState>

    <!-- grid -->
    <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <TrackCard v-for="track in library.sortedTracks" :key="track.id" :track="track" :list="library.sortedTracks" />
    </div>

    <p v-if="library.search && library.tracks.length === 0 && !library.loading" class="py-10 text-center text-sm text-cream-dim">
      No songs match “{{ library.search }}”.
    </p>
  </div>
</template>
