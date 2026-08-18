<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'

const props = withDefaults(defineProps<{ track: Track; list?: Track[] }>(), { list: undefined })

const player = usePlayerStore()

const isCurrent = computed(() => player.current?.id === props.track.id)
const isPlayingThis = computed(() => isCurrent.value && player.isPlaying)

/** Clicking a card plays it inside its surrounding list so next/prev move through it. */
function play(): void {
  if (props.list && props.list.length > 1) player.playInList(props.track, props.list)
  else player.playTrack(props.track)
}
</script>

<template>
  <div
    class="pillow-card group relative flex cursor-pointer flex-col overflow-hidden p-3"
    role="button"
    tabindex="0"
    :aria-label="`Play ${track.title}`"
    @click="isPlayingThis ? player.pause() : play()"
    @keydown.enter="isPlayingThis ? player.pause() : play()"
  >
    <div class="relative mb-3 aspect-square w-full overflow-hidden rounded-pillow-sm">
      <TrackArtwork :artwork-key="track.artworkKey" :title="track.title" rounded="rounded-pillow-sm" />

      <!-- play button: always visible on touch, on hover for desktop -->
      <button
        type="button"
        class="absolute bottom-2.5 right-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-lavender-200 text-night-950 shadow-glow-strong transition-all duration-300 hover:scale-105 lg:opacity-0 lg:group-hover:opacity-100"
        :aria-label="isPlayingThis ? 'Pause' : 'Play'"
        @click.stop="isPlayingThis ? player.pause() : play()"
      >
        <Play v-if="!isPlayingThis" class="h-5 w-5 translate-x-[1px] fill-current" />
        <span v-else class="h-2.5 w-2.5 rounded-[3px] bg-night-950" />
      </button>

      <div v-if="isCurrent" class="absolute left-2.5 top-2.5 rounded-full bg-night-950/60 px-2 py-1 backdrop-blur-md">
        <Equalizer :active="isPlayingThis" class="h-3.5" />
      </div>
    </div>

    <div class="flex items-start justify-between gap-2 px-0.5">
        <div class="min-w-0">
          <h3 class="truncate text-sm font-medium text-cream" :title="track.title">
            {{ track.title }}
          </h3>
          <p class="truncate text-xs text-cream-dim" :title="track.artist">{{ track.artist }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <TrackFavouriteButton :track="track" />
          <TrackAddToPlaylistButton :track="track" />
          <span class="text-[11px] tabular-nums text-cream-faint">
            {{ formatDuration(track.duration) }}
          </span>
        </div>
      </div>

  </div>
</template>
