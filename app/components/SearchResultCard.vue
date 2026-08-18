<script setup lang="ts">
import { Download, Plus } from 'lucide-vue-next'
import type { SearchResult } from '~/types/music'

const props = defineProps<{
  result: SearchResult
  selected?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{ select: [result: SearchResult] }>()
</script>

<template>
  <button
    type="button"
    class="pillow-card group flex w-full items-center gap-4 p-3 text-left"
    :class="{ 'glow-ring': selected }"
    @click="emit('select', result)"
  >
    <div class="relative h-14 w-14 shrink-0 overflow-hidden rounded-pillow-sm">
      <img
        v-if="result.thumbnail"
        :src="result.thumbnail"
        :alt="result.title"
        loading="lazy"
        class="h-full w-full object-cover"
      />
      <div v-else class="h-full w-full bg-gradient-to-br from-plum-700/50 to-night-850" />
    </div>

    <div class="min-w-0 flex-1">
      <h3 class="truncate text-sm font-medium text-cream">{{ result.title }}</h3>
      <p class="mt-0.5 truncate text-xs text-cream-dim">{{ result.artist }}</p>
      <p class="mt-0.5 text-[11px] tabular-nums text-cream-faint">
        {{ formatDuration(result.duration) }} · under five minutes
      </p>
    </div>

    <span
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
  </button>
</template>
