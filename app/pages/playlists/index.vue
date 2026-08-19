<script setup lang="ts">
import { ListMusic, Plus } from 'lucide-vue-next'
import type { Playlist } from '~/types/music'
import { apiErrorMessage, useToast } from '~/composables/useToast'


const toast = useToast()
const playlists = ref<Playlist[]>([])
const loading = ref(true)
const createOpen = ref(false)

async function fetchPlaylists(): Promise<void> {
  loading.value = true
  try {
    const res = await $fetch<{ playlists: Playlist[] }>('/api/playlists')
    playlists.value = res.playlists
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Your playlists could not be loaded.'))
  } finally {
    loading.value = false
  }
}

function onCreated(playlist: Playlist): void {
  playlists.value.unshift(playlist)
  navigateTo(`/playlists/${playlist.id}`)
}

function onDeleted(id: string): void {
  playlists.value = playlists.value.filter((p) => p.id !== id)
}

function onRenamed(playlist: Playlist): void {
  const idx = playlists.value.findIndex((p) => p.id === playlist.id)
  if (idx >= 0) playlists.value[idx] = playlist
}

onMounted(fetchPlaylists)
useHead({ title: 'Playlists' })
</script>

<template>
  <div class="animate-fade-in">
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow"
        >
          <ListMusic class="h-5 w-5 text-lavender-200" />
        </div>
        <div>
          <h1 class="font-display text-2xl font-semibold text-cream sm:text-3xl">Playlists</h1>
          <p class="mt-1 text-sm text-cream-dim">Shelves you have arranged yourself</p>
        </div>
      </div>
      <Button class="self-start sm:self-auto" @click="createOpen = true">
        <Plus class="h-4 w-4" />
        New playlist
      </Button>
    </header>

    <div v-if="loading && playlists.length === 0" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <Skeleton v-for="i in 4" :key="i" class="aspect-[4/5] rounded-pillow" />
    </div>

    <EmptyState
      v-else-if="playlists.length === 0"
      title="No playlists yet"
      description="Create a shelf for a mood, a season, or a single glowing song."
    >
      <Button @click="createOpen = true">
        <Plus class="h-4 w-4" />
        Create your first playlist
      </Button>
    </EmptyState>

    <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <PlaylistCard
        v-for="playlist in playlists"
        :key="playlist.id"
        :playlist="playlist"
        @deleted="onDeleted"
        @renamed="onRenamed"
      />
    </div>

    <PlaylistCreateDialog v-model:open="createOpen" @created="onCreated" />
  </div>
</template>
