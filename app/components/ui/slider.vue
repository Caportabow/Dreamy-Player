<script setup lang="ts">
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  type SliderRootEmits,
  type SliderRootProps,
} from 'radix-vue'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<SliderRootProps & { class?: string }>(), {
  orientation: 'horizontal',
})
const emits = defineEmits<SliderRootEmits>()
</script>

<template>
  <SliderRoot
    v-bind="props"
    :class="cn('relative flex w-full touch-none select-none items-center', props.class)"
    @update:model-value="emits('update:modelValue', $event)"
  >
    <SliderTrack class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
      <SliderRange class="absolute h-full rounded-full bg-lavender-400/80" />
    </SliderTrack>
    <SliderThumb
      class="block h-5 w-5 rounded-full border-2 border-lavender-200 bg-lavender-100 shadow-glow transition-transform hover:scale-110 focus:outline-none"
      aria-label="Volume"
    />
  </SliderRoot>
</template>
