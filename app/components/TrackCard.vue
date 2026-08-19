<script setup lang="ts">
import { Check, Play, Trash2 } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'
import { useLibraryStore } from '~/stores/library'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const props = withDefaults(defineProps<{ track: Track; list?: Track[] }>(), { list: undefined })

const player = usePlayerStore()
const library = useLibraryStore()
const toast = useToast()
const removing = ref(false)

// Two-step delete: the first tap arms the button, the second confirms. It
// disarms itself after a few seconds so a stray tap never deletes a song.
const armed = ref(false)
let disarmTimer: ReturnType<typeof setTimeout> | null = null

const isCurrent = computed(() => player.current?.id === props.track.id)
const isPlayingThis = computed(() => isCurrent.value && player.isPlaying)

/** Clicking a card plays it inside its surrounding list so next/prev move through it. */
function play(): void {
  if (props.list && props.list.length > 1) player.playInList(props.track, props.list)
  else player.playTrack(props.track)
}

function arm(): void {
  armed.value = true
  if (disarmTimer) clearTimeout(disarmTimer)
  disarmTimer = setTimeout(() => {
    armed.value = false
  }, 3500)
}

async function removeFromLibrary(): Promise<void> {
  if (removing.value) return
  removing.value = true
  armed.value = false
  if (disarmTimer) clearTimeout(disarmTimer)
  try {
    const ok = await library.removeTrack(props.track)
    if (!ok) throw new Error('remove failed')
    toast.success(`Removed “${props.track.title}” from the library.`)
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not remove this song from the library.'))
  } finally {
    removing.value = false
  }
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

      <!-- remove button: always visible on touch, on hover for desktop. First
           tap arms it (turns rose), second tap removes the song. -->
      <button
        type="button"
        class="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 lg:opacity-0 lg:group-hover:opacity-100"
        :class="
          armed
            ? 'bg-rose-500/85 text-night-950 shadow-glow hover:bg-rose-400'
            : 'bg-night-950/45 text-cream-muted hover:bg-rose-500/20 hover:text-rose-200'
        "
        :aria-label="armed ? `Confirm removing ${track.title}` : `Remove ${track.title} from the library`"
        :title="armed ? 'Tap again to remove' : 'Remove from library'"
        :disabled="removing"
        @click.stop="armed ? removeFromLibrary() : arm()"
      >
        <Check v-if="armed" class="h-4 w-4" />
        <Trash2 v-else class="h-4 w-4" />
      </button>
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
