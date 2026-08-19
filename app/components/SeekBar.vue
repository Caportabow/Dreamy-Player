<script setup lang="ts">
import { usePlayerStore } from '~/stores/player'

const props = defineProps<{
  modelValue: number
  max: number
}>()
const emit = defineEmits<{
  'update:modelValue': [value: number]
  seek: [value: number]
}>()

const trackEl = ref<HTMLDivElement | null>(null)
const dragging = ref(false)
const hover = ref(false)
const hoverPos = ref(0)

const percent = computed(() => {
  if (!props.max || props.max <= 0) return 0
  return Math.min(Math.max((props.modelValue / props.max) * 100, 0), 100)
})

const hoverPercent = computed(() => {
  if (!props.max || props.max <= 0) return 0
  return Math.min(Math.max((hoverPos.value / props.max) * 100, 0), 100)
})

function positionFromEvent(e: PointerEvent): number {
  const el = trackEl.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  // A hidden or zero-width bar (e.g. during responsive re-layout) must not
  // produce non-finite values.
  if (!(rect.width > 0) || !Number.isFinite(e.clientX)) return props.modelValue
  const ratio = (e.clientX - rect.left) / rect.width
  return Math.min(Math.max(ratio, 0), 1) * props.max
}

function onPointerDown(e: PointerEvent): void {
  dragging.value = true
  // Freeze the displayed position while dragging: the audio keeps playing
  // and its timeupdate (~4×/s) must not snap the thumb back.
  usePlayerStore().seeking = true
  emit('update:modelValue', positionFromEvent(e))
  try {
    trackEl.value?.setPointerCapture(e.pointerId)
  } catch {
    // Pointer may already be gone (e.g. synthetic or fast taps); seek still works.
  }
}

function onPointerMove(e: PointerEvent): void {
  if (dragging.value) {
    emit('update:modelValue', positionFromEvent(e))
  } else {
    const el = trackEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    hoverPos.value = ratio * props.max
  }
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  emit('seek', positionFromEvent(e))
}

function onPointerCancel(e: PointerEvent): void {
  // The browser took the pointer over (e.g. a system gesture) — commit the
  // dragged position rather than leaving the lock held.
  if (!dragging.value) return
  dragging.value = false
  emit('seek', positionFromEvent(e))
}
</script>

<template>
  <div
    ref="trackEl"
    class="group relative flex h-5 w-full cursor-pointer touch-none select-none items-center"
    @pointerdown.prevent="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerenter="hover = true"
    @pointerleave="hover = false"
  >
    <!-- hover tooltip -->
    <div
      v-if="hover && !dragging"
      class="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-full bg-night-700/95 px-2 py-0.5 text-[10px] text-cream shadow-soft"
      :style="{ left: `${hoverPercent}%` }"
    >
      {{ formatDuration(hoverPos) }}
    </div>

    <div class="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-lavender-400/80"
        :class="dragging ? 'transition-none' : 'transition-[width] duration-100'"
        :style="{ width: `${percent}%` }"
      />
      <div
        v-if="hover"
        class="absolute inset-y-0 rounded-full bg-white/15"
        :style="{ width: `${hoverPercent}%` }"
      />
    </div>

    <div
      class="absolute h-4 w-4 -translate-x-1/2 rounded-full bg-lavender-100 opacity-0 shadow-glow transition-opacity duration-200 group-hover:opacity-100 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5 [@media(pointer:coarse)]:opacity-100"
      :style="{ left: `${percent}%` }"
      :class="{ '!opacity-100': dragging }"
    />
  </div>
</template>
