<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  type DialogContentEmits,
  type DialogContentProps,
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

type SheetSide = 'top' | 'right' | 'bottom' | 'left'
const props = withDefaults(
  defineProps<DialogContentProps & { class?: string; side?: SheetSide }>(),
  { side: 'left' },
)
const emits = defineEmits<DialogContentEmits>()

const sideClasses: Record<SheetSide, string> = {
  top: 'top-0 left-0 right-0 border-b data-[state=open]:animate-fade-in-up',
  right: 'right-0 top-0 h-full w-3/4 max-w-sm border-l data-[state=open]:animate-fade-in',
  bottom: 'bottom-0 left-0 right-0 border-t rounded-t-pillow-lg data-[state=open]:animate-fade-in-up',
  left: 'left-0 top-0 h-full w-3/4 max-w-sm border-r data-[state=open]:animate-fade-in',
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 z-50 bg-night-950/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
    <DialogContent
      v-bind="props"
      :class="
        cn(
          'fixed z-50 flex flex-col gap-4 bg-night-850/95 p-6 shadow-soft-lg backdrop-blur-2xl',
          sideClasses[side],
          props.class,
        )
      "
      @pointer-down-outside="emits('pointerDownOutside', $event)"
    >
      <slot />
      <DialogClose
        class="absolute right-4 top-4 rounded-full p-1.5 text-cream-dim transition-colors hover:bg-white/10 hover:text-cream"
      >
        <X class="h-4 w-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
