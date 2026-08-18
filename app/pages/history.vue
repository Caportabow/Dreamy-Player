<script setup lang="ts">
import { History as HistoryIcon } from 'lucide-vue-next'
import type { HistoryEvent } from '~/types/music'
import { usePlayerStore } from '~/stores/player'
import { apiErrorMessage, useToast } from '~/composables/useToast'


const player = usePlayerStore()
const toast = useToast()
const events = ref<HistoryEvent[]>([])
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await $fetch<{ events: HistoryEvent[] }>('/api/history', { query: { limit: 50 } })
    events.value = res.events
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Your listening history could not be loaded.'))
  } finally {
    loading.value = false
  }
}

// Queue replays through the visible history so next/prev move along it.
const eventTracks = computed(() => events.value.map((e) => e.track))

function replay(event: HistoryEvent): void {
  player.playInList(event.track, eventTracks.value)
}

onMounted(load)
useHead({ title: 'History' })
</script>

<template>
  <div class="animate-fade-in">
    <header class="mb-6">
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow">
          <HistoryIcon class="h-5 w-5 text-lavender-200" />
        </div>
        <div>
          <h1 class="font-display text-2xl font-semibold text-cream sm:text-3xl">History</h1>
          <p class="mt-0.5 text-sm text-cream-dim">Your recent listening, in reverse order</p>
        </div>
      </div>
    </header>

    <div v-if="loading && events.length === 0" class="space-y-2">
      <Skeleton v-for="i in 6" :key="i" class="h-16" />
    </div>

    <EmptyState
      v-else-if="events.length === 0"
      title="Nothing played yet"
      description="Songs you listen to for more than a moment will gather here, softly."
    />

    <div v-else class="pillow flex flex-col gap-1 p-3">
      <div
        v-for="event in events"
        :key="event.id"
        class="group flex cursor-pointer items-center gap-3 rounded-pillow-sm px-2.5 py-2 transition-colors hover:bg-white/5"
        @click="replay(event)"
      >
        <div class="relative h-11 w-11 shrink-0 overflow-hidden rounded-pillow-sm">
          <TrackArtwork :artwork-key="event.track.artworkKey" :title="event.track.title" />
          <div
            v-if="player.current?.id === event.track.id"
            class="absolute inset-0 flex items-center justify-center bg-night-950/50"
          >
            <Equalizer :active="player.isPlaying" class="h-4" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-cream">{{ event.track.title }}</p>
          <p class="truncate text-xs text-cream-dim">{{ event.track.artist }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <TrackFavouriteButton :track="event.track" @toggle="(fav) => (event.track.favourite = fav)" />
          <div class="shrink-0 text-right">
            <p class="text-xs tabular-nums text-cream-dim">
              {{ formatDuration(event.listenedSeconds) }}
            </p>
            <p class="text-[11px] text-cream-faint">{{ formatRelativeDate(event.playedAt) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
