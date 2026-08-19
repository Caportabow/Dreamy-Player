<script setup lang="ts">
import { Heart, Library, ListMusic, Plus, UserRound } from 'lucide-vue-next'
import { NuxtLink } from '#components'
import { useAuthStore } from '~/stores/auth'
import { useToast } from '~/composables/useToast'

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const auth = useAuthStore()
const toast = useToast()
const createOpen = ref(false)

const navItems = [
  { label: 'Library', to: '/', icon: Library },
  { label: 'Add song', to: '/add', icon: Plus },
  { label: 'Favourites', to: '/favourites', icon: Heart },
  { label: 'Playlists', to: '/playlists', icon: ListMusic },
  { label: 'Profile', to: '/profile', icon: UserRound },
]

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

function onCreatePlaylist(): void {
  createOpen.value = true
}

function go(to: string): void {
  emit('navigate')
  navigateTo(to)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Brand -->
    <NuxtLink to="/" class="mb-6 flex items-center gap-3 px-2 pt-1" @click="emit('navigate')">
      <AppLogo :size="36" />
      <span class="font-display text-xl font-semibold tracking-wide text-cream text-glow">
        Dreamy
      </span>
    </NuxtLink>

    <!-- Navigation -->
    <nav class="flex flex-col gap-1" aria-label="Main">
      <button
        v-for="item in navItems"
        :key="item.to"
        type="button"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
        @click="go(item.to)"
      >
        <component :is="item.icon" class="nav-icon h-4.5 w-4.5 shrink-0" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <button
      type="button"
      class="mt-5 flex items-center justify-center gap-2 rounded-pillow-sm border border-dashed border-lavender-400/25 px-4 py-2.5 text-sm text-lavender-200/90 transition-all duration-300 hover:border-lavender-400/45 hover:bg-lavender-400/8 hover:text-lavender-100"
      @click="onCreatePlaylist"
    >
      <Plus class="h-4 w-4" />
      Create playlist
    </button>

    <PlaylistCreateDialog v-model:open="createOpen" @created="go(`/playlists/${$event.id}`)" />
  </div>
</template>
