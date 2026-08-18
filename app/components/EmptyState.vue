<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: 'logo' | 'music' | 'heart' | 'history' | 'chart'
  }>(),
  { icon: 'logo' },
)
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-20 text-center animate-fade-in-up">
    <div class="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/4 shadow-glow">
      <AppLogo v-if="icon === 'logo'" :size="48" />
    </div>
    <h2 class="text-lg font-semibold text-cream">{{ title }}</h2>
    <p v-if="description" class="mt-2 max-w-sm text-sm leading-relaxed text-cream-dim">
      {{ description }}
    </p>
    <div class="mt-6">
      <slot />
    </div>
  </div>
</template>
