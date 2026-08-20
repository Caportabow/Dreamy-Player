<script setup lang="ts">
import {
  ChevronDown,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-vue-next'
import { usePlayerStore } from '~/stores/player'
import { mediaUrl } from '~/types/music'

const player = usePlayerStore()
const queueOpen = ref(false)

const repeatIcon = computed(() => (player.repeatMode === 'track' ? Repeat1 : Repeat))

const artwork = computed(() => mediaUrl(player.current?.artworkKey))

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') player.closeExpanded()
  if (e.key === ' ') {
    e.preventDefault()
    player.toggle()
  }
}

watch(
  () => player.isExpanded,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-in">
      <div v-if="player.isExpanded && player.current" class="fixed inset-0 z-50 overflow-hidden">
        <!-- deep purple environment -->
        <div class="absolute inset-0 bg-night-950">
          <!-- colour bloom from the artwork -->
          <img
            v-if="artwork"
            :src="artwork"
            alt=""
            aria-hidden="true"
            class="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-3xl"
          />
          <div
            v-else
            class="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_20%,rgba(58,42,90,0.5),transparent_70%)]"
          />
          <!-- drifting gradient clouds -->
          <div class="absolute -left-[15%] -top-[20%] h-[55vh] w-[55vw] rounded-full bg-plum-700/30 blur-[110px] animate-aurora" />
          <div
            class="absolute -right-[18%] top-[15%] h-[60vh] w-[55vw] rounded-full bg-violet-700/25 blur-[120px] animate-aurora"
            style="animation-delay: -10s"
          />
          <div
            class="absolute -bottom-[25%] left-[10%] h-[55vh] w-[60vw] rounded-full bg-lavender-400/10 blur-[120px] animate-aurora"
            style="animation-delay: -18s"
          />
          <!-- floating orbs -->
          <div class="absolute left-[12%] top-[22%] h-2.5 w-2.5 rounded-full bg-lavender-300/50 blur-[1px] animate-float-slower" />
          <div class="absolute right-[18%] top-[30%] h-2 w-2 rounded-full bg-violet-400/40 blur-[1px] animate-float-slow" style="animation-delay: -4s" />
          <div class="absolute bottom-[26%] left-[28%] h-1.5 w-1.5 rounded-full bg-lavender-200/40 blur-[1px] animate-float-slower" style="animation-delay: -8s" />
          <div class="absolute right-[30%] bottom-[18%] h-2.5 w-2.5 rounded-full bg-plum-500/40 blur-[1px] animate-float-slow" style="animation-delay: -2s" />
        </div>

        <!-- header -->
        <div class="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-sm text-cream-muted backdrop-blur-md transition-colors hover:bg-white/10 hover:text-cream"
            @click="player.closeExpanded()"
          >
            <ChevronDown class="h-4 w-4" />
            <span class="hidden sm:inline">Now playing</span>
          </button>
          <button
            type="button"
            class="rounded-full bg-white/5 p-2.5 text-cream-muted backdrop-blur-md transition-colors hover:bg-white/10 hover:text-cream"
            aria-label="Close player"
            @click="player.closeExpanded()"
          >
            <X class="h-4.5 w-4.5" />
          </button>
        </div>

        <!-- body -->
        <div class="relative z-[5] flex h-full flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-24 sm:gap-10 lg:flex-row lg:gap-20 lg:px-16">
          <!-- oversized artwork with bloom -->
          <div class="relative shrink-0">
            <div
              v-if="artwork"
              class="absolute -inset-10 rounded-full opacity-50 blur-3xl"
              :style="{ background: 'radial-gradient(circle, rgba(150,118,210,0.55), transparent 70%)' }"
            />
            <div class="relative h-56 w-56 overflow-hidden rounded-pillow-lg shadow-soft-lg animate-float-slower sm:h-72 sm:w-72 lg:h-[42vh] lg:w-[42vh] lg:max-w-[380px]">
              <TrackArtwork :artwork-key="player.current.artworkKey" :title="player.current.title" rounded="rounded-pillow-lg" />
            </div>
          </div>

          <!-- controls -->
          <div class="w-full max-w-md shrink-0 lg:w-96">
            <div class="mb-6 text-center lg:text-left">
              <h2 class="text-xl font-semibold text-cream text-glow sm:text-2xl">
                {{ player.current.title }}
              </h2>
              <p class="mt-1.5 text-sm text-cream-dim">{{ player.current.artist }}</p>
            </div>

            <SeekBar
              :model-value="player.position"
              :max="player.duration || player.current.duration"
              class="mb-2"
              @update:model-value="(v: number) => (player.position = v)"
              @seek="player.seek"
            />
            <div class="mb-7 flex justify-between text-[11px] tabular-nums text-cream-faint">
              <span>{{ formatDuration(player.position) }}</span>
              <span>{{ formatDuration(player.duration || player.current.duration) }}</span>
            </div>

            <!-- cushion controls -->
            <div class="flex items-center justify-center gap-4 lg:justify-between">
              <button
                type="button"
                class="flex h-11 w-11 items-center justify-center rounded-full transition-all"
                :class="player.shuffle ? 'bg-lavender-400/15 text-lavender-200' : 'text-cream-muted hover:bg-white/6 hover:text-cream'"
                :aria-label="player.shuffle ? 'Shuffle off' : 'Shuffle on'"
                @click="player.toggleShuffle()"
              >
                <Shuffle class="h-5 w-5" />
              </button>

              <button
                type="button"
                class="flex h-14 w-14 items-center justify-center rounded-full bg-white/6 text-cream transition-all hover:bg-white/10 hover:scale-105"
                aria-label="Previous track"
                @click="player.prev()"
              >
                <SkipBack class="h-6 w-6 fill-current" />
              </button>

              <button
                type="button"
                class="flex h-20 w-20 items-center justify-center rounded-full bg-lavender-200 text-night-950 shadow-glow-strong transition-all duration-300 hover:scale-105 hover:bg-lavender-100"
                :aria-label="player.isPlaying ? 'Pause' : 'Play'"
                @click="player.toggle()"
              >
                <Play v-if="!player.isPlaying" class="ml-1 h-8 w-8 fill-current" />
                <Pause v-else class="h-8 w-8 fill-current" />
              </button>

              <button
                type="button"
                class="flex h-14 w-14 items-center justify-center rounded-full bg-white/6 text-cream transition-all hover:bg-white/10 hover:scale-105"
                aria-label="Next track"
                @click="player.next()"
              >
                <SkipForward class="h-6 w-6 fill-current" />
              </button>

              <button
                type="button"
                class="flex h-11 w-11 items-center justify-center rounded-full transition-all"
                :class="player.repeatMode !== 'off' ? 'bg-lavender-400/15 text-lavender-200' : 'text-cream-muted hover:bg-white/6 hover:text-cream'"
                :aria-label="`Repeat: ${player.repeatMode}`"
                @click="player.cycleRepeat()"
              >
                <component :is="repeatIcon" class="h-5 w-5" />
              </button>
            </div>

            <div class="mt-8 flex items-center justify-center gap-3 lg:justify-between">
              <VolumeControl
                :volume="player.volume"
                :muted="player.muted"
                class="lg:w-36"
                @update:volume="player.setVolume"
                @toggle-mute="player.toggleMute"
              />
              <button
                type="button"
                class="flex items-center gap-2 rounded-full px-4 py-2 text-xs transition-colors"
                :class="queueOpen ? 'bg-lavender-400/15 text-lavender-200' : 'text-cream-dim hover:bg-white/6 hover:text-cream'"
                @click="queueOpen = !queueOpen"
              >
                <ListMusic class="h-4 w-4" />
                Queue
              </button>
            </div>
          </div>
        </div>

        <!-- queue panel -->
        <Transition name="fade-in-up">
          <div
            v-if="queueOpen"
            class="absolute inset-x-0 bottom-0 z-10 max-h-[45vh] overflow-y-auto rounded-t-pillow-lg border-t border-white/8 bg-night-900/92 p-4 backdrop-blur-2xl"
          >
            <QueuePanel />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
