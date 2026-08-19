<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { usePlayerStore } from '~/stores/player'

// Shared queue list. The two player surfaces (bottom bar and expanded view)
// render this inside their own positioned, styled containers — keeping the
// rows themselves from drifting apart.
const player = usePlayerStore()
</script>

<template>
  <p class="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-cream-faint">
    Queue · {{ player.queue.length }} {{ player.queue.length === 1 ? 'track' : 'tracks' }}
  </p>
  <div
    v-for="(item, i) in player.queue"
    :key="item.id"
    role="button"
    tabindex="0"
    class="flex w-full cursor-pointer items-center gap-3 rounded-pillow-sm px-2 py-2 text-left transition-colors hover:bg-white/5"
    :class="{ 'bg-white/5': i === player.currentIndex }"
    @click="player.playQueue(player.queue, i)"
    @keydown.enter="player.playQueue(player.queue, i)"
  >
    <span class="w-5 text-center text-[11px] tabular-nums text-cream-faint">{{ i + 1 }}</span>
    <div class="h-9 w-9 shrink-0 overflow-hidden rounded-pillow-sm">
      <TrackArtwork :artwork-key="item.artworkKey" :title="item.title" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm" :class="i === player.currentIndex ? 'text-lavender-200' : 'text-cream'">
        {{ item.title }}
      </p>
      <p class="truncate text-xs text-cream-dim">{{ item.artist }}</p>
    </div>
    <span class="shrink-0 text-[11px] tabular-nums text-cream-faint">
      {{ formatDuration(item.duration) }}
    </span>
    <button
      type="button"
      class="rounded-full p-1.5 text-cream-faint transition-colors hover:bg-white/8 hover:text-cream"
      aria-label="Remove from queue"
      @click.stop="player.removeFromQueue(i)"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
  <p v-if="player.queue.length === 0" class="px-2 py-3 text-sm text-cream-dim">
    Your queue is resting.
  </p>
</template>
