<script setup lang="ts">
import { DropdownMenuLabel, type DropdownMenuLabelProps } from 'radix-vue'
import { cn } from '~/lib/utils'
const props = defineProps<DropdownMenuLabelProps & { class?: string; inset?: boolean }>()
</script>

<template>
  <DropdownMenuLabel
    v-bind="props"
    :class="cn('px-3 py-1.5 text-xs font-medium text-cream-dim', inset && 'pl-8', props.class)"
  />
</template>
