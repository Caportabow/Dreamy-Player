<script setup lang="ts">
import {
  BarChart3,
  Download,
  Heart,
  History,
  Library,
  ListMusic,
  LogOut,
  Plus,
} from 'lucide-vue-next'
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
  { label: 'Favourites', to: '/favourites', icon: Heart },
  { label: 'Playlists', to: '/playlists', icon: ListMusic },
  { label: 'Add Music', to: '/add', icon: Download },
  { label: 'History', to: '/history', icon: History },
  { label: 'Statistics', to: '/stats', icon: BarChart3 },
]

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

function initials(): string {
  const name = auth.displayName || auth.user?.email || '?'
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

async function onSignOut(): Promise<void> {
  await auth.signOut()
  toast.info('Signed out. Sweet dreams.')
  await navigateTo('/')
}

function onCreatePlaylist(): void {
  if (!auth.isSignedIn) {
    toast.info('Sign in to keep your favourites, playlists, and listening story close.')
    return
  }
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

    <div class="mt-auto">
      <template v-if="auth.isSignedIn">
        <div class="mb-2 flex items-center gap-3 rounded-pillow-sm bg-white/4 px-3 py-2.5">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lavender-400/70 to-plum-600/70 text-sm font-semibold text-night-950"
          >
            {{ initials() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-cream">{{ auth.displayName }}</p>
            <p class="truncate text-[11px] text-cream-dim">{{ auth.user?.email }}</p>
          </div>
          <Tooltip content-class="z-[70]">
            <button
              type="button"
              class="rounded-full p-2 text-cream-dim transition-colors hover:bg-white/8 hover:text-cream"
              aria-label="Sign out"
              @click="onSignOut"
            >
              <LogOut class="h-4 w-4" />
            </button>
            <template #content>Sign out</template>
          </Tooltip>
        </div>
      </template>

      <template v-else>
        <div class="rounded-pillow-sm bg-white/4 p-4">
          <p class="text-sm leading-relaxed text-cream-dim">
            Sign in to keep your favourites, playlists, and listening story close.
          </p>
          <Button :as="NuxtLink" to="/signin" variant="outline" class="mt-3 w-full" @click="emit('navigate')">
            Sign in
          </Button>
        </div>
      </template>
    </div>

    <PlaylistCreateDialog v-model:open="createOpen" @created="go(`/playlists/${$event.id}`)" />
  </div>
</template>
