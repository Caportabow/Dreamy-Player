<script setup lang="ts">
import { ListMusic, Plus } from 'lucide-vue-next'
import type { Playlist, Track } from '~/types/music'
import { useAuthStore } from '~/stores/auth'
import { apiErrorMessage, useToast } from '~/composables/useToast'
import { usePlaylistChanges } from '~/composables/usePlaylistChanges'

const props = defineProps<{ track: Track | null }>()
const open = defineModel<boolean>('open', { default: false })

const auth = useAuthStore()
const toast = useToast()
const playlists = ref<Playlist[]>([])
const loading = ref(false)
const addingId = ref<string | null>(null)
const { bump: bumpPlaylistChanges } = usePlaylistChanges()

watch(
  [() => props.track, open],
  async ([track, isOpen]) => {
    if (track && isOpen && auth.isSignedIn) {
      await loadPlaylists()
    }
  },
)

async function loadPlaylists(): Promise<void> {
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

async function addTo(playlist: Playlist): Promise<void> {
  if (!props.track) return
  addingId.value = playlist.id
  try {
    await $fetch(`/api/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      body: { trackId: props.track.id },
    })
    toast.success(`Added to “${playlist.name}”.`)
    // The sidebar shows that playlist's track count and artwork preview.
    bumpPlaylistChanges()
    open.value = false
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not add the track.'))
  } finally {
    addingId.value = null
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ListMusic class="h-4.5 w-4.5 text-lavender-300" />
          Add to playlist
        </DialogTitle>
        <DialogDescription v-if="track">
          “{{ track.title }}” · {{ track.artist }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        <div v-if="loading" class="space-y-2">
          <Skeleton v-for="i in 3" :key="i" class="h-10" />
        </div>
        <button
          v-for="playlist in playlists"
          :key="playlist.id"
          type="button"
          class="flex items-center justify-between gap-3 rounded-pillow-sm px-3.5 py-2.5 text-left transition-colors hover:bg-white/8"
          :disabled="addingId === playlist.id"
          @click="addTo(playlist)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm text-cream">{{ playlist.name }}</span>
            <span class="block text-xs text-cream-dim">{{ playlist.trackCount }} tracks</span>
          </span>
          <span
            class="rounded-full bg-white/5 p-1.5 text-cream-dim"
            :class="{ 'animate-spin': addingId === playlist.id }"
          >
            <Plus class="h-3.5 w-3.5" />
          </span>
        </button>
        <p v-if="!loading && playlists.length === 0" class="px-2 py-3 text-sm text-cream-dim">
          No playlists yet — create one from the sidebar.
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
