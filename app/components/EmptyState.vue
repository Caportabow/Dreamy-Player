<script setup lang="ts">
import { BarChart3, Heart, History, Music } from 'lucide-vue-next'

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
    <div
      class="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-plum-700/40 to-violet-700/25 shadow-glow"
    >
      <AppLogo v-if="icon === 'logo'" :size="48" />
      <Music v-else-if="icon === 'music'" class="h-8 w-8 text-lavender-300" stroke-width="1.5" />
      <Heart v-else-if="icon === 'heart'" class="h-8 w-8 text-lavender-300" stroke-width="1.5" />
      <History v-else-if="icon === 'history'" class="h-8 w-8 text-lavender-300" stroke-width="1.5" />
      <BarChart3 v-else-if="icon === 'chart'" class="h-8 w-8 text-lavender-300" stroke-width="1.5" />
    </div>
    <h2 class="font-display text-lg font-semibold text-cream">{{ title }}</h2>
    <p v-if="description" class="mt-2 max-w-sm text-sm leading-relaxed text-cream-dim">
      {{ description }}
    </p>
    <div class="mt-6">
      <slot />
    </div>
  </div>
</template>
