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

const player = usePlayerStore()

const repeatIcon = computed(() => (player.repeatMode === 'track' ? Repeat1 : Repeat))
const repeatActive = computed(() => player.repeatMode !== 'off')
const queueOpen = ref(false)

function openExpanded(): void {
  player.openExpanded()
}
</script>

<template>
  <Transition name="fade-in">
    <div v-if="player.current" class="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <!-- Desktop bar -->
      <div class="pointer-events-auto mx-auto mb-4 hidden w-[min(1040px,calc(100%-3rem))] lg:block">
        <div class="relative">
          <div class="glass rounded-pillow-lg px-5 py-3.5">
            <!-- top row: artwork + meta · transport · volume + queue -->
            <div class="flex items-center gap-4">
              <!-- left: artwork + meta (desktop bar never expands) -->
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <div class="relative h-12 w-12 shrink-0 overflow-hidden rounded-pillow-sm">
                  <TrackArtwork :artwork-key="player.current.artworkKey" :title="player.current.title" />
                  <div
                    v-if="player.isPlaying"
                    class="absolute inset-0 flex items-center justify-center bg-night-950/40"
                  >
                    <Equalizer active class="h-3.5" />
                  </div>
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-cream">{{ player.current.title }}</p>
                  <p class="truncate text-xs text-cream-dim">{{ player.current.artist }}</p>
                </div>
              </div>

              <!-- center: transport -->
              <div class="flex flex-1 items-center justify-center gap-1.5">
                <Tooltip content-class="z-[70]">
                  <button
                    type="button"
                    class="rounded-full p-2 text-cream-muted transition-all hover:bg-white/5 hover:text-cream"
                    :class="{ 'text-lavender-300': player.shuffle }"
                    :aria-label="player.shuffle ? 'Shuffle off' : 'Shuffle on'"
                    @click="player.toggleShuffle()"
                  >
                    <Shuffle class="h-4 w-4" />
                  </button>
                  <template #content>{{ player.shuffle ? 'Shuffle on' : 'Shuffle off' }}</template>
                </Tooltip>

                <button
                  type="button"
                  class="rounded-full p-2.5 text-cream transition-all hover:bg-white/5"
                  aria-label="Previous track"
                  @click="player.prev()"
                >
                  <SkipBack class="h-5 w-5 fill-current" />
                </button>

                <button
                  type="button"
                  class="flex h-11 w-11 items-center justify-center rounded-full bg-lavender-200 text-night-950 shadow-glow transition-all hover:scale-105 hover:bg-lavender-100"
                  :aria-label="player.isPlaying ? 'Pause' : 'Play'"
                  @click="player.toggle()"
                >
                  <Play v-if="!player.isPlaying" class="ml-0.5 h-5 w-5 fill-current" />
                  <Pause v-else class="h-5 w-5 fill-current" />
                </button>

                <button
                  type="button"
                  class="rounded-full p-2.5 text-cream transition-all hover:bg-white/5"
                  aria-label="Next track"
                  @click="player.next()"
                >
                  <SkipForward class="h-5 w-5 fill-current" />
                </button>

                <Tooltip content-class="z-[70]">
                  <button
                    type="button"
                    class="rounded-full p-2 text-cream-muted transition-all hover:bg-white/5 hover:text-cream"
                    :class="{ 'text-lavender-300': repeatActive }"
                    :aria-label="`Repeat: ${player.repeatMode}`"
                    @click="player.cycleRepeat()"
                  >
                    <component :is="repeatIcon" class="h-4 w-4" />
                  </button>
                  <template #content>
                    {{ player.repeatMode === 'off' ? 'Repeat off' : player.repeatMode === 'queue' ? 'Repeat queue' : 'Repeat track' }}
                  </template>
                </Tooltip>
              </div>

              <!-- right: volume + queue -->
              <div class="flex shrink-0 items-center gap-3">
                <VolumeControl
                  :volume="player.volume"
                  :muted="player.muted"
                  class="w-40"
                  @update:volume="player.setVolume"
                  @toggle-mute="player.toggleMute"
                />
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-full px-4 py-2 text-xs text-cream-dim transition-colors hover:bg-white/6 hover:text-cream"
                  :class="{ 'text-lavender-200': queueOpen }"
                  @click="queueOpen = !queueOpen"
                >
                  <ListMusic class="h-4 w-4" />
                  Queue
                </button>
              </div>
            </div>

            <!-- timeline: full width of the bar -->
            <div class="mt-3 flex w-full items-center gap-2.5">
              <span class="w-9 shrink-0 text-right text-[10px] tabular-nums text-cream-faint">
                {{ formatDuration(player.position) }}
              </span>
              <SeekBar
                :model-value="player.position"
                :max="player.duration || player.current.duration"
                class="flex-1"
                @update:model-value="(v: number) => (player.position = v)"
                @seek="player.seek"
              />
              <span class="w-9 shrink-0 text-[10px] tabular-nums text-cream-faint">
                {{ formatDuration(player.duration || player.current.duration) }}
              </span>
            </div>
          </div>

          <!-- queue panel -->
          <Transition name="fade-in-up">
            <div
              v-if="queueOpen"
              class="absolute inset-x-0 bottom-full z-10 mb-3 max-h-[45vh] overflow-y-auto rounded-pillow-lg border border-white/8 bg-night-900/92 p-4 backdrop-blur-2xl"
            >
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
            </div>
          </Transition>
        </div>
      </div>

      <!-- Mobile mini player -->
      <div class="pointer-events-auto mx-3 mb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:hidden">
        <div
          role="button"
          tabindex="0"
          class="glass flex w-full cursor-pointer items-center gap-3 rounded-pillow-lg px-3.5 py-2.5 text-left"
          @click="openExpanded"
          @keydown.enter="openExpanded"
        >
          <div class="h-10 w-10 shrink-0 overflow-hidden rounded-pillow-sm">
            <TrackArtwork :artwork-key="player.current.artworkKey" :title="player.current.title" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-cream">{{ player.current.title }}</p>
            <p class="truncate text-xs text-cream-dim">{{ player.current.artist }}</p>
          </div>
          <button
            type="button"
            class="rounded-full p-2.5 text-cream"
            :aria-label="player.isPlaying ? 'Pause' : 'Play'"
            @click.stop="player.toggle()"
          >
            <Play v-if="!player.isPlaying" class="h-5 w-5 fill-current" />
            <Pause v-else class="h-5 w-5 fill-current" />
          </button>
          <button
            type="button"
            class="rounded-full p-2.5 text-cream"
            aria-label="Next track"
            @click.stop="player.next()"
          >
            <SkipForward class="h-5 w-5 fill-current" />
          </button>
          <ChevronDown class="h-4 w-4 shrink-0 text-cream-faint" />
        </div>
      </div>
    </div>
  </Transition>
</template>
