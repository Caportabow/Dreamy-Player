<script setup lang="ts">
import { BadgeCheck, Download, Pause, Play, Plus } from 'lucide-vue-next'
import type { SearchResult } from '~/types/music'
import { useTrackPreview } from '~/composables/useTrackPreview'
import { usePlayerStore } from '~/stores/player'

const props = withDefaults(
  defineProps<{
    result: SearchResult
    selected?: boolean
    busy?: boolean
    /** Inline "Add to library" button instead of the select indicator. */
    add?: boolean
  }>(),
  { selected: false, busy: false, add: false },
)
const emit = defineEmits<{ select: [result: SearchResult]; add: [result: SearchResult] }>()

const { playingUrl, togglePreview } = useTrackPreview()
const player = usePlayerStore()

const isPreviewing = computed(
  () => props.result.previewUrl !== null && playingUrl.value === props.result.previewUrl,
)

function select(): void {
  emit('select', props.result)
}

function toggle(): void {
  if (!props.result.previewUrl) return
  // Listening to a preview pauses whatever song is playing.
  player.pause()
  void togglePreview(props.result.previewUrl)
}
</script>

<template>
  <div
    class="pillow-card group flex w-full items-center gap-4 p-3 text-left"
    :class="{ 'glow-ring': selected }"
    role="button"
    tabindex="0"
    :aria-label="`Select ${result.title} by ${result.artist}`"
    @click="select"
    @keydown.enter="select"
    @keydown.space.prevent="select"
  >
    <div class="relative h-14 w-14 shrink-0 overflow-hidden rounded-pillow-sm">
      <img
        v-if="result.artworkUrl || result.thumbnail"
        :src="result.artworkUrl || result.thumbnail || undefined"
        :alt="result.title"
        loading="lazy"
        class="h-full w-full object-cover"
      />
      <div v-else class="h-full w-full bg-gradient-to-br from-plum-700/50 to-night-850" />
    </div>

    <div class="min-w-0 flex-1">
      <h3 class="flex items-center gap-1.5 truncate text-sm font-medium text-cream">
        <span class="truncate">{{ result.title }}</span>
        <BadgeCheck
          v-if="result.matched"
          class="h-4 w-4 shrink-0 text-lavender-200"
          :aria-label="'Name matched on MusicBrainz'"
          title="Name matched on MusicBrainz"
        />
      </h3>
      <p class="mt-0.5 truncate text-xs text-cream-dim">
        {{ result.artist }}{{ result.album ? ` · ${result.album}` : '' }}
      </p>
      <p class="mt-0.5 text-[11px] tabular-nums text-cream-faint">
        {{ formatDuration(result.duration) }}
      </p>
    </div>

    <!-- 30-second preview (Apple iTunes) before committing to a download -->
    <button
      v-if="result.previewUrl"
      type="button"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-cream-muted transition-all duration-300 hover:bg-white/10 hover:text-cream"
      :class="{ 'bg-lavender-200 text-night-950 shadow-glow': isPreviewing }"
      :aria-label="isPreviewing ? 'Stop preview' : `Preview ${result.title}`"
      :title="isPreviewing ? 'Stop preview' : 'Listen to a 30-second preview'"
      @click.stop="toggle"
    >
      <Pause v-if="isPreviewing" class="h-4 w-4 fill-current" />
      <Play v-else class="ml-0.5 h-4 w-4 fill-current" />
    </button>

    <button
      v-if="add"
      type="button"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-cream-muted transition-all duration-300 hover:bg-lavender-200 hover:text-night-950 hover:shadow-glow disabled:opacity-50"
      :aria-label="`Add ${result.title} to the library`"
      :title="'Add to library'"
      :disabled="busy"
      @click.stop="emit('add', result)"
    >
      <Download class="h-4 w-4" />
    </button>

    <span
      v-else
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cream-muted transition-all duration-300"
      :class="
        selected
          ? 'bg-lavender-200 text-night-950 shadow-glow'
          : 'bg-white/5 group-hover:bg-white/10 group-hover:text-cream'
      "
    >
      <Download v-if="!selected" class="h-4 w-4" />
      <Plus v-else class="h-4 w-4" />
    </span>
  </div>
</template>
