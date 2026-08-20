<script setup lang="ts">
import { Music2, Plus } from 'lucide-vue-next'
import { NuxtLink } from '#components'
import { mediaUrl } from '~/types/music'
import type { Playlist } from '~/types/music'
import { usePlaylistChanges } from '~/composables/usePlaylistChanges'

const emit = defineEmits<{ navigate: [] }>()

const route = useRoute()
const createOpen = ref(false)
const playlists = ref<Playlist[]>([])
const loading = ref(false)
const { playlistChanges } = usePlaylistChanges()

// Shared with the mobile bottom bar — see ~/utils/navigation. The sidebar
// renders differently (Profile docks at the bottom), so we split the list.
const topNavItems = computed(() => mainNavItems.slice(0, -1))
const profileNavItems = computed(() => mainNavItems.slice(-1))

function isActive(to: string): boolean {
  return isMainNavActive(route.path, to)
}

async function loadPlaylists(): Promise<void> {
  loading.value = true
  try {
    const res = await $fetch<{ playlists: Playlist[] }>('/api/playlists')
    // Oldest first: the library grid stays newest-first, but the sidebar is a
    // shortcut list where your long-standing shelves belong at the top.
    playlists.value = [...res.playlists].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
  } catch {
    playlists.value = []
  } finally {
    loading.value = false
  }
}

function onCreatePlaylist(): void {
  createOpen.value = true
}

function onCreated(playlist: Playlist): void {
  // Newest shelf goes to the bottom, keeping the oldest-first order.
  playlists.value = [...playlists.value.filter((p) => p.id !== playlist.id), playlist]
  go(`/playlists/${playlist.id}`)
}

function go(to: string): void {
  emit('navigate')
  navigateTo(to)
}

onMounted(loadPlaylists)

// Keep the sidebar list fresh after visiting playlist pages (create, rename,
// delete all happen there) and after in-place edits elsewhere in the app that
// never change the route (rename on the playlist page, adding a track from
// the library).
watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/playlists')) void loadPlaylists()
  },
)
watch(playlistChanges, () => void loadPlaylists())
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

    <!-- Primary navigation (Profile is docked separately at the bottom) -->
    <nav class="flex flex-col gap-1" aria-label="Main">
      <div v-for="item in topNavItems" :key="item.to">
        <!-- Playlists gets a small “+” to create a new one in place -->
        <div v-if="item.to === '/playlists'" class="flex items-center gap-1.5">
          <button
            type="button"
            class="nav-item min-w-0 flex-1"
            :class="{ active: isActive(item.to) }"
            @click="go(item.to)"
          >
            <component :is="item.icon" class="nav-icon h-4.5 w-4.5 shrink-0" />
            <span class="truncate">{{ item.label }}</span>
          </button>
          <button
            type="button"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-cream-faint transition-colors hover:bg-white/10 hover:text-cream"
            aria-label="Create playlist"
            :title="'Create playlist'"
            @click="onCreatePlaylist"
          >
            <Plus class="h-4 w-4" />
          </button>
        </div>

        <button
          v-else
          type="button"
          class="nav-item w-full"
          :class="{ active: isActive(item.to) }"
          @click="go(item.to)"
        >
          <component :is="item.icon" class="nav-icon h-4.5 w-4.5 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </nav>

    <!-- Playlists section: quick access straight from the sidebar -->
    <div class="mt-2 flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
        <button
          v-for="playlist in playlists"
          :key="playlist.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-pillow-sm px-3 py-1.5 text-sm transition-colors"
          :class="
            isActive(`/playlists/${playlist.id}`)
              ? 'bg-white/7 text-lavender-200'
              : 'text-cream-dim hover:bg-white/5 hover:text-cream'
          "
          @click="go(`/playlists/${playlist.id}`)"
        >
          <!-- A crisp mini album tile: tight radius, hairline border, and a
               soft violet placeholder until the cover arrives. -->
          <span
            class="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-white/6 bg-gradient-to-br from-plum-700/40 to-night-850 shadow-inner-soft"
          >
            <img
              v-if="playlist.artworkKey"
              :src="mediaUrl(playlist.artworkKey)"
              :alt="playlist.name"
              loading="lazy"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center bg-gradient-to-br from-plum-600/50 to-violet-700/30"
            >
              <Music2 class="h-3.5 w-3.5 text-lavender-200/80" stroke-width="1.5" />
            </div>
          </span>
          <span class="min-w-0 truncate">{{ playlist.name }}</span>
        </button>
        <p v-if="!loading && playlists.length === 0" class="px-3 py-2 text-xs text-cream-faint">
          No playlists yet — tap + to start one.
        </p>
      </div>
    </div>

    <!-- Profile docks at the bottom -->
    <nav class="mt-3 flex flex-col gap-1 border-t border-white/6 pt-3" aria-label="Account">
      <button
        v-for="item in profileNavItems"
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

    <PlaylistCreateDialog v-model:open="createOpen" @created="onCreated" />
  </div>
</template>
