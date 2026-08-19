<script setup lang="ts">
import {
  ArrowDownUp,
  Check,
  Library as LibraryIcon,
  Loader2,
  Play,
  Plus,
  Search,
  Shuffle,
  X,
} from 'lucide-vue-next'
import type { SegmentedTab } from '~/components/SegmentedTabs.vue'
import type { SearchResult } from '~/types/music'
import { useLibraryStore } from '~/stores/library'
import { useDownloadsStore } from '~/stores/downloads'
import { usePlayerStore } from '~/stores/player'
import { apiErrorMessage, useToast } from '~/composables/useToast'

type PageMode = 'library' | 'add'

const library = useLibraryStore()
const downloads = useDownloadsStore()
const player = usePlayerStore()
const toast = useToast()

/** Which search the box feeds: your collection, or the internet. */
const mode = ref<PageMode>('library')
const viewModes: SegmentedTab[] = [
  { value: 'library', label: 'Library', icon: LibraryIcon },
  { value: 'add', label: 'Add songs', icon: Plus },
]

const searchInput = ref('')
const addingId = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let lastSearchQuery = ''

const sortOptions = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
]

const currentSortLabel = computed(
  () => sortOptions.find((o) => o.value === library.sort)?.label ?? 'Recently added',
)

/** "Newest first" reads naturally for added; A→Z / Z→A for names. */
const orderLabels = computed(() =>
  library.sort === 'added' ? ['Newest first', 'Oldest first'] : ['A → Z', 'Z → A'],
)

const pageTitle = computed(() => (mode.value === 'library' ? 'Library' : 'Add songs'))
const pageSubtitle = computed(() =>
  mode.value === 'library'
    ? `${library.total} ${library.total === 1 ? 'song' : 'songs'} resting in the collection`
    : 'Find something new for the collection',
)
const searchPlaceholder = computed(() =>
  mode.value === 'library' ? 'Search songs, artists, albums…' : 'Search for a song to add…',
)

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

/** One query, two lenses — the box feeds whichever mode is active. */
watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (mode.value === 'add') {
      runRemoteSearch()
    } else {
      library.search = searchInput.value
      library.fetchTracks()
    }
  }, 300)
})

function switchMode(next: string): void {
  const target = next as PageMode
  if (mode.value === target) return
  mode.value = target
  // Carry the query over to the other engine.
  if (target === 'add') {
    runRemoteSearch()
  } else {
    library.search = searchInput.value
    library.fetchTracks()
  }
}

/** Jump from "not in my library" straight to finding it online. */
function searchOnline(): void {
  switchMode('add')
  focusSearch()
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
  if (mode.value === 'library') void library.fetchTracks()
}

function changeSort(value: string): void {
  library.sort = value as 'added' | 'title' | 'artist'
  library.fetchTracks()
}

function setOrder(value: 'asc' | 'desc'): void {
  library.order = value
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
        <h1 class="font-display text-2xl font-semibold text-cream sm:text-3xl">{{ pageTitle }}</h1>
        <p class="mt-1 text-sm text-cream-dim">{{ pageSubtitle }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- which search is the box feeding? -->
        <SegmentedTabs
          :model-value="mode"
          :items="viewModes"
          label="Library view"
          class="order-1 shrink-0"
          @update:model-value="switchMode"
        />

        <!-- On mobile the search takes its own full-width row (order 3); on
             sm+ it slots back inline between the tabs and the sort button. -->
        <div class="relative order-3 w-full min-w-0 sm:order-2 sm:w-72 sm:flex-1">
          <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
          <Input
            id="library-search"
            v-model="searchInput"
            type="search"
            :placeholder="searchPlaceholder"
            class="pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
            :aria-label="mode === 'library' ? 'Search songs to play' : 'Search for songs to add'"
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

        <!-- Sort only applies to the library grid — hidden in Add songs mode.
             The wrapper collapses its width so the search bar glides instead of jumping. -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="w-0 opacity-0"
          enter-to-class="w-9 opacity-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="w-9 opacity-100"
          leave-to-class="w-0 opacity-0"
        >
          <div v-if="mode === 'library'" class="order-2 w-9 overflow-hidden sm:order-3">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="subtle"
                  size="icon"
                  class="h-9 w-9 rounded-full text-cream-muted hover:text-cream"
                  :aria-label="`Sort by ${currentSortLabel}`"
                  :title="`Sort by ${currentSortLabel}`"
                >
                  <ArrowDownUp class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-44">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :class="library.sort === opt.value ? 'text-lavender-200' : ''"
                  @select="changeSort(opt.value)"
                >
                  <Check v-if="library.sort === opt.value" class="h-4 w-4" />
                  <span v-else class="h-4 w-4" />
                  {{ opt.label }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Order</DropdownMenuLabel>
                <DropdownMenuItem
                  :class="library.order === 'desc' ? 'text-lavender-200' : ''"
                  @select="setOrder('desc')"
                >
                  <Check v-if="library.order === 'desc'" class="h-4 w-4" />
                  <span v-else class="h-4 w-4" />
                  {{ orderLabels[0] }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  :class="library.order === 'asc' ? 'text-lavender-200' : ''"
                  @select="setOrder('asc')"
                >
                  <Check v-if="library.order === 'asc'" class="h-4 w-4" />
                  <span v-else class="h-4 w-4" />
                  {{ orderLabels[1] }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Transition>
      </div>
    </header>

    <Transition
      mode="out-in"
      enter-active-class="animate-fade-in-up"
      leave-active-class="animate-fade-out-down"
    >
      <!-- Add songs mode: search the catalog, preview, add -->
      <div v-if="mode === 'add'" key="add">
        <template v-if="!searchInput.trim()">
          <div
            class="flex flex-col items-center gap-3 rounded-pillow-lg border border-dashed border-white/6 bg-white/2 py-16 text-center"
          >
            <Equalizer class="h-8" />
            <p class="text-sm text-cream-dim">
              Type above to search for new songs — preview them and add them in one tap.
            </p>
          </div>
        </template>
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

      <!-- Library mode: filter the collection -->
      <div v-else key="library">
        <!-- loading skeleton -->
        <div
          v-if="library.loading && library.tracks.length === 0"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
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

        <!-- empty library -->
        <EmptyState
          v-else-if="library.tracks.length === 0 && !searchInput.trim()"
          title="A quiet room, so far"
          description="Search the internet for a song and add it to start your collection."
        >
          <Button @click="searchOnline">Add your first song</Button>
        </EmptyState>

        <!-- grid -->
        <div
          v-else-if="library.tracks.length > 0"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          <TrackCard v-for="track in library.sortedTracks" :key="track.id" :track="track" :list="library.sortedTracks" />
        </div>

        <!-- searching, but nothing in the library matches — offer to look online -->
        <div v-else-if="library.search && !library.loading" class="flex flex-col items-center gap-3 py-12 text-center">
          <p class="text-sm text-cream-dim">No songs in your library match “{{ library.search }}”.</p>
          <Button variant="secondary" size="sm" @click="searchOnline">
            Search online for “{{ library.search }}”
          </Button>
        </div>
      </div>
    </Transition>
  </div>
</template>
