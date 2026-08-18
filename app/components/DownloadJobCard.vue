<script setup lang="ts">
import { CheckCircle2, CircleAlert, Music } from 'lucide-vue-next'
import type { DownloadJob } from '~/types/music'

const props = defineProps<{ job: DownloadJob }>()

const stageLabel = computed(() => {
  switch (props.job.status) {
    case 'queued':
      return 'Waiting in line…'
    case 'searching':
      return 'Finding the right version…'
    case 'downloading':
      return 'Gently downloading…'
    case 'converting':
      return 'Wrapping it in a pillow…'
    case 'uploading':
      return 'Tucking it into the library…'
    case 'complete':
      return 'Done — now in your library.'
    case 'failed':
      return props.job.error || 'The download failed.'
    default:
      return props.job.stage || props.job.status
  }
})

const isActive = computed(() => !['complete', 'failed'].includes(props.job.status))
const percent = computed(() => Math.min(Math.max(props.job.progress || 0, 0), 100))
</script>

<template>
  <div class="pillow-card flex items-center gap-4 p-4">
    <div
      class="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-pillow-sm"
    >
      <img
        v-if="job.artworkUrl"
        :src="job.artworkUrl"
        :alt="job.title || 'Track'"
        loading="lazy"
        class="h-full w-full object-cover"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center bg-gradient-to-br from-plum-700/50 to-night-850"
      >
        <Music class="h-5 w-5 text-lavender-300/60" />
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="truncate text-sm font-medium text-cream">{{ job.title || 'Untitled' }}</h3>
        <span class="shrink-0 text-[11px] text-cream-faint">{{ percent }}%</span>
      </div>
      <p class="truncate text-xs text-cream-dim">{{ job.artist || 'Searching…' }}</p>

      <div class="mt-2 flex items-center gap-2.5">
        <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            class="absolute inset-y-0 left-0 rounded-full bg-lavender-400/80 transition-all duration-700"
            :style="{ width: `${percent}%` }"
          />
        </div>
        <CheckCircle2 v-if="job.status === 'complete'" class="h-4 w-4 shrink-0 text-lavender-300" />
        <CircleAlert
          v-else-if="job.status === 'failed'"
          class="h-4 w-4 shrink-0 text-rose-300/80"
        />
        <span v-else class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-lavender-300/30 border-t-lavender-300" />
      </div>

      <p
        class="mt-1.5 truncate text-[11px] text-cream-faint"
        :class="{ 'text-rose-200/80': job.status === 'failed' }"
      >
        {{ stageLabel }}
      </p>
    </div>
  </div>
</template>
