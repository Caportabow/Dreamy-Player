<script setup lang="ts">
import {
  DropdownMenuItem,
  type DropdownMenuItemEmits,
  type DropdownMenuItemProps,
  useForwardPropsEmits,
} from 'radix-vue'
import { cn } from '~/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: string; inset?: boolean }>()
const emits = defineEmits<DropdownMenuItemEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex cursor-pointer select-none items-center gap-2.5 rounded-pillow-sm px-3 py-2 text-sm text-cream-muted outline-none transition-colors',
        'hover:bg-white/8 hover:text-cream focus:bg-white/8 focus:text-cream',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
