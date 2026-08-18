<script setup lang="ts">
withDefaults(defineProps<{ active?: boolean; bars?: number; className?: string }>(), {
  active: false,
  bars: 4,
})

const delays = [0, 0.12, 0.24, 0.06]
const durations = [1.05, 0.9, 1.2, 0.85]
const heights = [9, 15, 11, 17]
</script>

<template>
  <div class="flex items-end gap-[3px]" :class="className" :aria-hidden="true">
    <div
      v-for="i in bars"
      :key="i"
      class="w-[3px] origin-bottom rounded-full bg-lavender-300"
      :class="active ? '' : 'opacity-40'"
      :style="
        active
          ? {
              height: `${heights[(i - 1) % 4]}px`,
              animation: `eq-bar ${durations[(i - 1) % 4]}s ease-in-out ${delays[(i - 1) % 4]}s infinite`,
            }
          : { height: '5px' }
      "
    />
  </div>
</template>
