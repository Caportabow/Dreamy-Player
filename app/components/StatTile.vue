<script setup lang="ts">
defineProps<{ label: string; value: string; hint?: string }>()
</script>

<template>
  <div class="pillow-card flex flex-col gap-1 p-5">
    <span class="text-xs uppercase tracking-wider text-cream-faint">{{ label }}</span>
    <span class="text-2xl font-semibold text-lavender-100 text-glow">{{ value }}</span>
    <span v-if="hint" class="text-xs text-cream-dim">{{ hint }}</span>
  </div>
</template>
