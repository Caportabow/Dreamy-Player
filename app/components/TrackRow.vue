<script setup lang="ts">
import { GripVertical, Trash2 } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'

const props = withDefaults(
  defineProps<{
    track: Track
    list?: Track[]
    draggable?: boolean
    removeLabel?: string
  }>(),
  { draggable: false, list: undefined },
)

const emit = defineEmits<{ remove: [track: Track]; toggle: [favourite: boolean] }>()

const player = usePlayerStore()
const isCurrent = computed(() => player.current?.id === props.track.id)
const isPlayingThis = computed(() => isCurrent.value && player.isPlaying)

let lastClickAt = 0

/** Clicking a row plays it inside its surrounding list so next/prev move through it. */
function play(): void {
  // A double-click fires two click events; the second would restart the track
  // mid-flight, so swallow any click landing inside the double-click window
  // (the first click already did the playing).
  const now = Date.now()
  if (now - lastClickAt < 300) {
    lastClickAt = 0
    return
  }
  lastClickAt = now
  if (props.list && props.list.length > 1) player.playInList(props.track, props.list)
  else player.playTrack(props.track)
}
</script>

<template>
  <div
    class="group flex cursor-pointer items-center gap-3 rounded-pillow-sm px-2.5 py-2 transition-colors duration-300 hover:bg-white/5"
    :class="{ 'bg-white/5': isCurrent }"
    @click="play()"
  >
    <GripVertical
      v-if="draggable"
      class="h-4 w-4 shrink-0 cursor-grab text-cream-faint active:cursor-grabbing [@media(pointer:coarse)]:hidden"
      aria-hidden="true"
    />

    <div class="relative h-11 w-11 shrink-0 overflow-hidden rounded-pillow-sm">
      <TrackArtwork :artwork-key="track.artworkKey" :title="track.title" />
      <div
        v-if="isCurrent"
        class="absolute inset-0 flex items-center justify-center bg-night-950/50 backdrop-blur-[2px]"
      >
        <Equalizer :active="isPlayingThis" class="h-4" />
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm text-cream" :title="track.title">
        {{ track.title }}
      </p>
      <p class="truncate text-xs text-cream-dim" :title="track.artist">{{ track.artist }}</p>
    </div>

    <span class="hidden shrink-0 text-xs tabular-nums text-cream-faint sm:block">
      {{ formatDuration(track.duration) }}
    </span>

    <div class="flex shrink-0 items-center gap-1">
      <TrackFavouriteButton :track="track" @toggle="emit('toggle', $event)" />
      <TrackAddToPlaylistButton :track="track" />
      <button
        v-if="removeLabel"
        type="button"
        class="rounded-full p-2 text-cream-faint opacity-0 transition-all hover:bg-white/5 hover:text-rose-200 group-hover:opacity-100 [@media(hover:none)]:opacity-70"
        :aria-label="removeLabel"
        @click.stop="emit('remove', track)"
      >
        <Trash2 class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
