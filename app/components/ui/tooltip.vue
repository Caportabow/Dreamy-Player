<script setup lang="ts">
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  type TooltipContentProps,
  type TooltipRootEmits,
  type TooltipRootProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<TooltipRootProps & { contentClass?: string }>(), {
  delayDuration: 350,
})
const emits = defineEmits<TooltipRootEmits>()

// useForwardPropsEmits drops undefined props (e.g. `open` when uncontrolled),
// so radix keeps its own defaults instead of receiving Boolean-coerced `false`.
const forwarded = useForwardPropsEmits(props, emits)

defineSlots<{
  default: (props: {}) => any
  content: (props: {}) => any
}>()
</script>

<template>
  <TooltipProvider>
    <TooltipRoot v-bind="forwarded">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent
        class="z-[80] rounded-pillow-sm bg-night-700/95 px-3 py-1.5 text-xs text-cream shadow-soft backdrop-blur-xl data-[state=delayed-open]:animate-fade-in"
        :class="contentClass"
      >
        <slot name="content" />
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
</template>
