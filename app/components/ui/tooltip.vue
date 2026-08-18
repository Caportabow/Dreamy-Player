<script setup lang="ts">
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  type TooltipContentProps,
  type TooltipRootProps,
} from 'radix-vue'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<TooltipRootProps & { contentClass?: string }>(), {
  delayDuration: 350,
})

defineSlots<{
  default: (props: {}) => any
  content: (props: {}) => any
}>()
</script>

<template>
  <TooltipProvider>
    <TooltipRoot v-bind="props">
      <slot />
      <TooltipContent
        class="z-[80] rounded-pillow-sm bg-night-700/95 px-3 py-1.5 text-xs text-cream shadow-soft backdrop-blur-xl data-[state=delayed-open]:animate-fade-in"
        :class="contentClass"
      >
        <slot name="content" />
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
</template>
