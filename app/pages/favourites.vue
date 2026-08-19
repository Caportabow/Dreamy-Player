<script setup lang="ts">
import { Heart, Play, Search, Shuffle } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'

const player = usePlayerStore()
const tracks = ref<Track[]>([])
const loading = ref(true)
const search = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

async function fetchFavourites(): Promise<void> {
  loading.value = true
  try {
    const res = await $fetch<{ tracks: Track[] }>('/api/favourites', {
      query: { search: search.value || undefined },
    })
    tracks.value = res.tracks
  } catch {
    tracks.value = []
  } finally {
    loading.value = false
  }
}

watch(search, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(fetchFavourites, 250)
})

function playAll(): void {
  if (tracks.value.length > 0) player.playTrackList(tracks.value, 0)
}

function onToggleTrack(track: Track, favourite: boolean): void {
  // Un-favouriting from this page should let the song drift away immediately.
  if (!favourite) tracks.value = tracks.value.filter((t) => t.id !== track.id)
}

function shuffleAll(): void {
  if (tracks.value.length === 0) return
  player.playTrackList(shuffleArray(tracks.value), 0)
}

onMounted(fetchFavourites)
useHead({ title: 'Favourites' })
</script>

<template>
  <div class="animate-fade-in">
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow">
          <Heart class="h-5 w-5 text-lavender-200" />
        </div>
        <div>
          <h1 class="font-display text-2xl font-semibold text-cream text-glow sm:text-3xl">Favourites</h1>
          <p class="mt-0.5 text-sm text-cream-dim">A quiet personal shelf</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1 sm:w-64">
          <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
          <Input v-model="search" type="search" placeholder="Search favourites…" class="pl-10" />
        </div>
        <Button variant="secondary" size="sm" :disabled="tracks.length === 0" @click="playAll">
          <Play class="h-4 w-4 fill-current" />
          <span class="hidden sm:inline">Play all</span>
        </Button>
        <Button variant="secondary" size="sm" :disabled="tracks.length === 0" @click="shuffleAll">
          <Shuffle class="h-4 w-4" />
          <span class="hidden sm:inline">Shuffle</span>
        </Button>
      </div>
    </header>

    <div v-if="loading && tracks.length === 0" class="space-y-2">
      <Skeleton v-for="i in 6" :key="i" class="h-16" />
    </div>

    <EmptyState
      v-else-if="tracks.length === 0"
      icon="heart"
      title="Nothing here yet"
      description="Tap the little heart on any song to keep it close. It will wait for you here."
    />

    <div v-else class="pillow flex flex-col gap-1 p-3">
      <TrackRow
        v-for="track in tracks"
        :key="track.id"
        :track="track"
        :list="tracks"
        @toggle="onToggleTrack(track, $event)"
      />
    </div>
  </div>
</template>
