<script setup lang="ts">
import { BarChart3 } from 'lucide-vue-next'
import type { StatsData, Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'
import { formatListenTime } from '~/composables/useTimeFormat'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const player = usePlayerStore()
const toast = useToast()
const stats = ref<StatsData | null>(null)
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true
  try {
    stats.value = await $fetch<StatsData>('/api/history/stats')
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Your listening story could not be loaded.'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
useHead({ title: 'Statistics' })

function trackLabel(track: Track): string {
  return track.artist ? `${track.title} · ${track.artist}` : track.title
}

// Queue top-track clicks through the list so next/prev move along it.
const topTrackList = computed(() => stats.value?.topTracks.map((e) => e.track) ?? [])

function playTop(entry: { track: Track }): void {
  player.playInList(entry.track, topTrackList.value)
}
</script>

<template>
  <div class="animate-fade-in">
    <ProfileSubNav />

    <header class="mb-6 flex items-center gap-3">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow">
        <BarChart3 class="h-5 w-5 text-lavender-200" />
      </div>
      <div class="min-w-0">
        <h1 class="truncate font-display text-2xl font-semibold text-cream text-glow sm:text-3xl">Statistics</h1>
        <p class="mt-0.5 truncate text-sm text-cream-dim">Your quiet listening story</p>
      </div>
    </header>

    <div v-if="loading && !stats" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-28 rounded-pillow" />
    </div>

    <EmptyState
      v-else-if="stats && stats.totalPlays === 0"
      icon="chart"
      title="Your story hasn't begun"
      description="Listen to a few songs, and your quiet listening story will begin to appear here."
    />

    <div v-else-if="stats" class="flex flex-col gap-6">
      <!-- totals -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Time listened" :value="formatListenTime(stats.totalSeconds)" hint="across everything" />
        <StatTile label="Plays" :value="String(stats.totalPlays)" hint="songs started" />
        <StatTile label="Unique songs" :value="String(stats.uniqueTracks)" hint="touched your ears" />
      </div>

      <!-- activity chart -->
      <div class="pillow-card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-medium text-cream-muted">Last 30 days</h2>
          <span class="text-[11px] text-cream-faint">seconds per day</span>
        </div>
        <ActivityChart :data="stats.daily" />
      </div>

      <!-- top tracks + artists -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="pillow-card p-5">
          <h2 class="mb-3 text-sm font-medium text-cream-muted">Top tracks</h2>
          <div v-if="stats.topTracks.length === 0" class="py-6 text-center text-sm text-cream-dim">
            No favourites emerged yet.
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="(entry, i) in stats.topTracks"
              :key="entry.track.id"
              role="button"
              tabindex="0"
              class="flex cursor-pointer items-center gap-3 rounded-pillow-sm px-2.5 py-2 text-left transition-colors hover:bg-white/5"
              @click="playTop(entry)"
              @keydown.enter="playTop(entry)"
            >
              <span class="w-5 shrink-0 text-center text-xs tabular-nums text-cream-faint">{{ i + 1 }}</span>
              <div class="h-11 w-11 shrink-0 overflow-hidden rounded-pillow-sm">
                <TrackArtwork :artwork-key="entry.track.artworkKey" :title="entry.track.title" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-cream">{{ entry.track.title }}</p>
                <p class="truncate text-xs text-cream-dim">{{ entry.track.artist }}</p>
              </div>
              <TrackFavouriteButton :track="entry.track" @toggle="(fav) => (entry.track.favourite = fav)" />
              <span class="shrink-0 text-[11px] tabular-nums text-cream-faint">
                {{ formatListenTime(entry.seconds) }}
              </span>
            </div>
          </div>
        </div>

        <div class="pillow-card p-5">
          <h2 class="mb-3 text-sm font-medium text-cream-muted">Top artists</h2>
          <div v-if="stats.topArtists.length === 0" class="py-6 text-center text-sm text-cream-dim">
            No artists yet.
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="(entry, i) in stats.topArtists"
              :key="entry.artist"
              class="flex items-center gap-3 rounded-pillow-sm px-2.5 py-2"
            >
              <span class="w-5 shrink-0 text-center text-xs tabular-nums text-cream-faint">{{ i + 1 }}</span>
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-pillow-sm bg-gradient-to-br from-plum-700/50 to-violet-700/30 text-sm font-semibold text-lavender-200">
                {{ entry.artist.slice(0, 1).toUpperCase() }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-cream">{{ entry.artist }}</p>
                <p class="truncate text-xs text-cream-dim">{{ entry.plays }} {{ entry.plays === 1 ? 'play' : 'plays' }}</p>
              </div>
              <span class="shrink-0 text-[11px] tabular-nums text-cream-faint">
                {{ formatListenTime(entry.seconds) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
