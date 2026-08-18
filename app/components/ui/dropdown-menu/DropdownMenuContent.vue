<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  type DropdownMenuContentEmits,
  type DropdownMenuContentProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<DropdownMenuContentProps & { class?: string; align?: 'start' | 'center' | 'end' }>(),
  { align: 'end', sideOffset: 6 },
)
const emits = defineEmits<DropdownMenuContentEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      v-bind="forwarded"
      :class="
        cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-pillow-sm border border-white/8 bg-night-800/95 p-1.5 shadow-soft-lg backdrop-blur-2xl',
          'data-[state=open]:animate-fade-in-up data-[state=closed]:animate-fade-in',
          props.class,
        )
      "
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>
