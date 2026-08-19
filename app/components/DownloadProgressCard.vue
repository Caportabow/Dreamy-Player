<script setup lang="ts">
import { Check, Download } from 'lucide-vue-next'
import { useDownloadsStore } from '~/stores/downloads'

const downloads = useDownloadsStore()

const job = computed(() => downloads.activeJobs[0] ?? null)
const more = computed(() => Math.max(0, downloads.activeJobs.length - 1))
const completed = computed(() => downloads.completedTitle)

// While queued/searching we show the equalizer; actual transfer stages spin
// a soft ring around the download icon.
const listening = computed(() => {
  const s = job.value?.status
  return s === 'queued' || s === 'searching'
})

const title = computed(() => job.value?.title || 'A new song')
const stage = computed(
  () =>
    job.value?.stage ||
    (job.value?.status === 'queued' ? 'Waiting in line…' : 'Working on it…'),
)
const progress = computed(() => Math.max(0, Math.min(100, job.value?.progress ?? 0)))
</script>

<template>
  <!-- brief “done” flash after the last download completes -->
  <Transition name="fade-in-up">
    <div
      v-if="completed && !job"
      class="fixed right-4 top-[4.5rem] z-50 w-80 max-w-[calc(100vw-2rem)] lg:right-6 lg:top-6"
    >
      <div class="glass rounded-pillow-lg p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavender-200 text-night-950 shadow-glow"
          >
            <Check class="h-5 w-5" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-cream">Added to your library</p>
            <p class="truncate text-xs text-cream-dim">{{ completed }}</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- active download progress -->
  <Transition name="fade-in-up">
    <div v-if="job" class="fixed right-4 top-[4.5rem] z-50 w-80 max-w-[calc(100vw-2rem)] lg:right-6 lg:top-6">
      <div class="glass rounded-pillow-lg p-4">
        <div class="flex items-center gap-3">
          <div class="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <span class="absolute inset-0 rounded-full bg-lavender-400/15 animate-breathe" />
            <span
              v-if="!listening"
              class="absolute inset-0 animate-spin rounded-full border-2 border-lavender-300/20 border-t-lavender-300"
            />
            <Equalizer v-if="listening" active class="h-4" />
            <Download v-else class="h-4 w-4 text-lavender-200" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-cream">{{ title }}</p>
            <p class="truncate text-xs text-cream-dim">{{ stage }}</p>
          </div>
          <span class="shrink-0 text-xs tabular-nums text-cream-faint">{{ progress }}%</span>
        </div>

        <!-- progress bar glides between poll updates (every ~2.5s) -->
        <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
          <div
            class="h-full rounded-full bg-gradient-to-r from-plum-500 via-lavender-400 to-lavender-300 transition-[width] duration-700 ease-out"
            :style="{ width: `${progress}%` }"
          />
        </div>

        <p v-if="more > 0" class="mt-2 text-[11px] text-cream-faint">
          {{ more }} more {{ more === 1 ? 'song' : 'songs' }} waiting in the queue
        </p>
      </div>
    </div>
  </Transition>
</template>
