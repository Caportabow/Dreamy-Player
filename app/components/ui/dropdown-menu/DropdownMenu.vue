<script setup lang="ts">
import { DropdownMenuRoot, type DropdownMenuRootEmits, type DropdownMenuRootProps } from 'radix-vue'

const props = defineProps<DropdownMenuRootProps>()
const emits = defineEmits<DropdownMenuRootEmits>()
</script>

<template>
  <DropdownMenuRoot v-bind="props" @update:open="emits('update:open', $event)">
    <slot />
  </DropdownMenuRoot>
</template>
