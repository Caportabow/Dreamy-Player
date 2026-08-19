<script setup lang="ts">
import { BarChart3, History, Settings } from 'lucide-vue-next'
import type { SegmentedTab } from '~/components/SegmentedTabs.vue'

const route = useRoute()

const items: SegmentedTab[] = [
  { label: 'History', value: '/profile/history', icon: History },
  { label: 'Statistics', value: '/profile/stats', icon: BarChart3 },
  { label: 'Settings', value: '/profile', icon: Settings },
]

// Exact match first (Settings lives on /profile itself), then prefix match.
const active = computed(() => {
  const exact = items.find((i) => i.value === route.path)
  if (exact) return exact.value
  return items.find((i) => route.path.startsWith(`${i.value}/`))?.value ?? items[0]!.value
})

function go(value: string): void {
  navigateTo(value)
}
</script>

<template>
  <SegmentedTabs
    :model-value="active"
    :items="items"
    label="Profile sections"
    class="mb-6"
    @update:model-value="go"
  />
</template>
