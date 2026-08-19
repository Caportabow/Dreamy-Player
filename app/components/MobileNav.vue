<script setup lang="ts">
import { Heart, Library, ListMusic, UserRound } from 'lucide-vue-next'

const route = useRoute()

const items = [
  { label: 'Library', to: '/', icon: Library },
  { label: 'Favourites', to: '/favourites', icon: Heart },
  { label: 'Playlists', to: '/playlists', icon: ListMusic },
  { label: 'Profile', to: '/profile', icon: UserRound },
]

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-white/6 bg-night-900/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden"
    aria-label="Bottom navigation"
  >
    <div class="grid grid-cols-4">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors"
        :class="isActive(item.to) ? 'text-lavender-200' : 'text-cream-faint hover:text-cream-muted'"
      >
        <span
          class="flex h-7 w-14 items-center justify-center rounded-full transition-all duration-300"
          :class="
            isActive(item.to)
              ? 'bg-lavender-400/15 shadow-[0_0_18px_-4px_rgba(140,110,200,0.5)]'
              : ''
          "
        >
          <component :is="item.icon" class="h-5 w-5" />
        </span>
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
