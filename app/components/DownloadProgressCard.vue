<script setup lang="ts">
import { Check, CircleAlert, Download, X } from 'lucide-vue-next'
import { useDownloadsStore } from '~/stores/downloads'

const downloads = useDownloadsStore()

const job = computed(() => downloads.activeJobs[0] ?? null)
const more = computed(() => Math.max(0, downloads.activeJobs.length - 1))
const completed = computed(() => downloads.completedTitle)
const failedJobs = computed(() => downloads.failedJobs)

function dismissFailed(id: string): void {
  downloads.dismissFailed(id)
}

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
  <div
    class="fixed right-4 top-[4.5rem] z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 lg:right-6 lg:top-6"
  >
    <!-- failed downloads: the reason stays on screen until dismissed -->
    <Transition name="fade-in-up">
      <div v-if="failedJobs.length > 0" class="flex flex-col gap-2">
        <div
          v-for="f in failedJobs"
          :key="f.id"
          class="glass rounded-pillow-lg p-4"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/15"
            >
              <CircleAlert class="h-5 w-5 text-rose-300" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-cream">
                {{ f.title || 'Download failed' }}
              </p>
              <p class="mt-0.5 text-xs leading-relaxed text-cream-dim">
                {{ f.error || 'The download failed. Please try again.' }}
              </p>
            </div>
            <button
              type="button"
              class="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-cream-faint transition-colors hover:bg-white/10 hover:text-cream"
              :aria-label="`Dismiss the failure notice for ${f.title || 'this download'}`"
              title="Dismiss"
              @click="dismissFailed(f.id)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- brief “done” flash after the last download completes -->
    <Transition name="fade-in-up">
      <div
        v-if="completed && !job"
        class="glass rounded-pillow-lg p-4"
      >
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
    </Transition>

    <!-- active download progress -->
    <Transition name="fade-in-up">
      <div v-if="job" class="glass rounded-pillow-lg p-4">
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
    </Transition>
  </div>
</template>
