<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  type DialogContentProps,
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

const props = defineProps<DialogContentProps & { class?: string }>()

// Strip `class` so it isn't spread onto the outer centering wrapper — it belongs
// on the inner panel (dialogs pass `max-w-sm` / `max-w-md` overrides).
const contentProps = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-night-950/70 backdrop-blur-sm data-[state=open]:animate-fade-in"
    />
    <!-- Centered with flex (no transforms), so the entrance animation can animate
         transform freely without knocking the dialog off-centre. -->
    <DialogContent
      v-bind="contentProps"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 data-[state=open]:animate-fade-in-up"
    >
      <div
        :class="
          cn(
            'relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-pillow-lg border border-white/8 bg-night-850/90 p-6 shadow-soft-lg backdrop-blur-2xl',
            props.class,
          )
        "
      >
        <slot />
        <DialogClose
          class="absolute right-4 top-4 rounded-full p-1.5 text-cream-dim transition-colors hover:bg-white/10 hover:text-cream"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </div>
    </DialogContent>
  </DialogPortal>
</template>
