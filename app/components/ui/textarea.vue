<script setup lang="ts">
import { cn } from '~/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{ class?: string; modelValue?: string }>(), {
  modelValue: '',
})
const emits = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    :value="props.modelValue"
    @input="emits('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    v-bind="$attrs"
    :class="cn('input-soft min-h-[90px] resize-none leading-relaxed', props.class)"
  />
</template>
