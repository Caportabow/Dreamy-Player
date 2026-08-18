<script setup lang="ts">
import { BarChart3, History, Settings } from 'lucide-vue-next'

const route = useRoute()

const items = [
  { label: 'Settings', to: '/profile', icon: Settings, exact: true },
  { label: 'History', to: '/profile/history', icon: History },
  { label: 'Statistics', to: '/profile/stats', icon: BarChart3 },
]

function isActive(item: (typeof items)[number]): boolean {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}
</script>

<template>
  <nav
    class="mb-6 inline-flex flex-wrap gap-1 rounded-pillow-sm bg-white/4 p-1"
    aria-label="Profile sections"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-2 rounded-pillow-sm px-3.5 py-2 text-sm transition-all duration-300"
      :class="
        isActive(item)
          ? 'bg-white/10 text-cream shadow-soft'
          : 'text-cream-dim hover:bg-white/5 hover:text-cream'
      "
    >
      <component :is="item.icon" class="h-4 w-4" />
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
