<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '~/lib/utils'

export interface SegmentedTab {
  label: string
  value: string
  icon?: Component
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    items: SegmentedTab[]
    label?: string
    class?: string
  }>(),
  { label: 'Sections' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div
    role="tablist"
    :aria-label="props.label"
    class="inline-flex flex-wrap items-center gap-1 rounded-pillow-sm bg-white/5 p-1 shadow-inner-soft"
    :class="cn(props.class)"
  >
    <button
      v-for="item in props.items"
      :key="item.value"
      type="button"
      role="tab"
      :aria-selected="props.modelValue === item.value"
      class="flex items-center gap-2 rounded-pillow-sm px-4 py-1.5 text-sm font-medium transition-all duration-300"
      :class="
        props.modelValue === item.value
          ? 'bg-lavender-200 text-night-950 shadow-glow'
          : 'text-cream-muted hover:text-cream'
      "
      @click="emit('update:modelValue', item.value)"
    >
      <component :is="item.icon" v-if="item.icon" class="h-4 w-4" />
      {{ item.label }}
    </button>
  </div>
</template>
