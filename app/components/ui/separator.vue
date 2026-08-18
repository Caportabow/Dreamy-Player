<script setup lang="ts">
import { Separator, type SeparatorProps } from 'radix-vue'
import { cn } from '~/lib/utils'
const props = defineProps<SeparatorProps & { class?: string }>()
</script>

<template>
  <Separator
    v-bind="props"
    :class="cn('h-px w-full shrink-0 bg-white/8', props.class)"
  />
</template>
