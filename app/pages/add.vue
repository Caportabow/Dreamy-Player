<script setup lang="ts">
import { Loader2, Plus, Search, X } from 'lucide-vue-next'
import type { SearchResult } from '~/types/music'
import { useDownloadsStore } from '~/stores/downloads'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const route = useRoute()
const downloads = useDownloadsStore()
const toast = useToast()

const searchInput = ref('')
const addingId = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let lastSearchQuery = ''

// Results briefly flip to a ✓ so the tap feels answered even before the toast.
const addedIds = ref(new Set<string>())
const addedTimers = new Map<string, ReturnType<typeof setTimeout>>()

function markAdded(id: string): void {
  addedIds.value = new Set(addedIds.value).add(id)
  clearTimeout(addedTimers.get(id))
  addedTimers.set(
    id,
    setTimeout(() => {
      const next = new Set(addedIds.value)
      next.delete(id)
      addedIds.value = next
      addedTimers.delete(id)
    }, 2500),
  )
}

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

function loadMoreResults(): void {
  void downloads.loadMore()
}

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
    markAdded(result.id)
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'The download could not be started.'))
  } finally {
    addingId.value = null
  }
}

watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runRemoteSearch, 300)
})

function clearSearch(): void {
  searchInput.value = ''
  if (searchTimer) clearTimeout(searchTimer)
  downloads.reset()
  lastSearchQuery = ''
}

// The Library page hands its query over via ?q= ("Search online for …").
onMounted(() => {
  const q = route.query.q
  if (typeof q === 'string' && q.trim()) {
    searchInput.value = q
    runRemoteSearch()
  }
})

useSlashFocus(() => document.getElementById('add-search'))

useHead({ title: 'Add song' })
</script>

<template>
  <div class="animate-fade-in">
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow"
        >
          <Plus class="h-5 w-5 text-lavender-200" />
        </div>
        <div>
          <h1 class="font-display text-2xl font-semibold text-cream text-glow sm:text-3xl">Add song</h1>
          <p class="mt-1 text-sm text-cream-dim">Find something new for the collection</p>
        </div>
      </div>

      <div class="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
        <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
        <Input
          id="add-search"
          v-model="searchInput"
          type="search"
          placeholder="Search for a song to add…"
          class="pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          aria-label="Search for songs to add"
        />
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 scale-50"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-50"
        >
          <button
            v-if="searchInput"
            type="button"
            class="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-cream-faint transition-colors hover:bg-white/10 hover:text-cream"
            aria-label="Clear search"
            title="Clear search"
            @click="clearSearch"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </Transition>
      </div>
    </header>

    <!-- waiting for a query -->
    <EmptyState
      v-if="!searchInput.trim()"
      icon="music"
      title="Search to add songs"
      description="Type above to find new songs — preview them and add them in one tap."
    />

    <template v-else>
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
            :added="addedIds.has(result.id)"
            @add="addResult"
          />
        </div>

        <div v-if="downloads.hasMore" class="mt-2 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            :disabled="downloads.loadingMore"
            @click="loadMoreResults"
          >
            <Loader2 v-if="downloads.loadingMore" class="h-4 w-4 animate-spin" />
            {{ downloads.loadingMore ? 'Loading more…' : 'Load more' }}
          </Button>
        </div>
      </div>

      <p v-else-if="!downloads.searching" class="py-6 text-center text-sm text-cream-dim">
        No new songs found for “{{ searchInput }}”.
      </p>
    </template>
  </div>
</template>
