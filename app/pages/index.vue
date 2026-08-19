<script setup lang="ts">
import {
  ArrowDownUp,
  Check,
  Library as LibraryIcon,
  Play,
  Search,
  Shuffle,
  X,
} from 'lucide-vue-next'
import { useLibraryStore } from '~/stores/library'
import { usePlayerStore } from '~/stores/player'

const library = useLibraryStore()
const player = usePlayerStore()

const searchInput = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

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

const subtitle = computed(
  () => `${library.total} ${library.total === 1 ? 'song' : 'songs'} resting in the collection`,
)

watch(searchInput, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    library.search = searchInput.value
    library.fetchTracks()
  }, 300)
})

function playAll(): void {
  if (library.tracks.length > 0) player.playTrackList(library.sortedTracks, 0)
}

function shuffleAll(): void {
  const tracks = library.sortedTracks
  if (tracks.length === 0) return
  // Smart shuffle: interleaves the two halves of the sorted list, so the
  // queue stays spread across the active sort direction (newer↔older, A↔Z)
  // instead of random clumps.
  player.playTrackList(smartShuffle(tracks), 0)
}

/** Jump from "not in my library" straight to finding it online. */
function searchOnline(): void {
  const q = searchInput.value.trim()
  navigateTo({ path: '/add', query: q ? { q } : {} })
}

function clearSearch(): void {
  searchInput.value = ''
  if (searchTimer) clearTimeout(searchTimer)
  library.search = ''
  void library.fetchTracks()
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
      <div class="flex items-center gap-3">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow"
        >
          <LibraryIcon class="h-5 w-5 text-lavender-200" />
        </div>
        <div>
          <h1 class="font-display text-2xl font-semibold text-cream text-glow sm:text-3xl">Library</h1>
          <p class="mt-1 text-sm text-cream-dim">{{ subtitle }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1 sm:w-72">
          <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
          <Input
            id="library-search"
            v-model="searchInput"
            type="search"
            placeholder="Search songs, artists, albums…"
            class="pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
            aria-label="Search songs to play"
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

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="subtle"
              size="icon"
              class="h-9 w-9 shrink-0 rounded-full text-cream-muted hover:text-cream"
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
    </header>

    <!-- Play the whole filtered shelf in one tap -->
    <div v-if="library.tracks.length > 0" class="mb-4 flex items-center gap-2">
      <Button variant="secondary" size="sm" @click="playAll">
        <Play class="h-4 w-4 fill-current" />
        <span class="hidden sm:inline">Play all</span>
      </Button>
      <Button variant="secondary" size="sm" @click="shuffleAll">
        <Shuffle class="h-4 w-4" />
        <span class="hidden sm:inline">Shuffle</span>
      </Button>
    </div>

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
      icon="library"
      title="The library is dozing off"
      description="We couldn't reach it just now. Give it a nudge and try again."
    >
      <Button @click="library.fetchTracks()">Try again</Button>
    </EmptyState>

    <!-- empty library -->
    <EmptyState
      v-else-if="library.tracks.length === 0 && !searchInput.trim()"
      icon="library"
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
</template>
