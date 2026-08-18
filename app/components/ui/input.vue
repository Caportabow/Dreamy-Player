<script setup lang="ts">
import { cn } from '~/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{ class?: string; modelValue?: string }>(), {
  modelValue: '',
})
const emits = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    :value="props.modelValue"
    @input="emits('update:modelValue', ($event.target as HTMLInputElement).value)"
    v-bind="$attrs"
    :class="cn('input-soft', props.class)"
  />
</template>
