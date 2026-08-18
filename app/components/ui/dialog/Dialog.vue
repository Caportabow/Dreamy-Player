<script setup lang="ts">
import { DialogRoot, type DialogRootProps } from 'radix-vue'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <DialogRoot v-bind="props" @update:open="emits('update:open', $event)">
    <slot />
  </DialogRoot>
</template>
