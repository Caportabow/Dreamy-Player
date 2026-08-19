<script setup lang="ts">
import { Volume1, Volume2, VolumeX } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<{ volume: number; muted: boolean; class?: string }>(),
  { class: '' },
)
const emit = defineEmits<{ 'update:volume': [number]; toggleMute: [] }>()

const Icon = computed(() => {
  if (props.muted || props.volume === 0) return VolumeX
  if (props.volume < 0.5) return Volume1
  return Volume2
})
</script>

<template>
  <div :class="cn('group flex w-24 items-center gap-2', props.class)">
    <button
      type="button"
      class="rounded-full p-2 text-cream-dim transition-colors hover:bg-white/5 hover:text-cream"
      aria-label="Mute"
      @click="emit('toggleMute')"
    >
      <component :is="Icon" class="h-4.5 w-4.5" />
    </button>
    <div class="min-w-0 flex-1">
      <Slider
        :model-value="muted ? [0] : [volume]"
        :max="1"
        :step="0.01"
        class="h-5"
        @update:model-value="(v: number[] | undefined) => emit('update:volume', v?.[0] ?? 0)"
      />
    </div>
  </div>
</template>
