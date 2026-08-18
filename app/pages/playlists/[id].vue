<script setup lang="ts">
import {
  GripVertical,
  ListMusic,
  Pencil,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2,
} from 'lucide-vue-next'
import type { Playlist, Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'
import { apiErrorMessage, useToast } from '~/composables/useToast'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const toast = useToast()
const player = usePlayerStore()

const playlistId = computed(() => String(route.params.id))
const playlist = ref<Playlist | null>(null)
const tracks = ref<Track[]>([])
const loading = ref(true)
const saving = ref(false)
const editOpen = ref(false)
const addOpen = ref(false)

// drag state
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await $fetch<{ playlist: Playlist; tracks: Track[] }>(
      `/api/playlists/${playlistId.value}`,
    )
    playlist.value = res.playlist
    tracks.value = res.tracks
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'This playlist could not be loaded.'))
  } finally {
    loading.value = false
  }
}

function playAll(): void {
  if (tracks.value.length > 0) player.playTrackList(tracks.value, 0)
}

function shuffleAll(): void {
  if (tracks.value.length === 0) return
  player.playTrackList([...tracks.value].sort(() => Math.random() - 0.5), 0)
}

// ---- drag & drop reorder (optimistic) ----
function onDragStart(index: number): void {
  dragIndex.value = index
}

function onDragOver(e: DragEvent, index: number): void {
  e.preventDefault()
  dragOverIndex.value = index
}

async function onDrop(): Promise<void> {
  const from = dragIndex.value
  const to = dragOverIndex.value
  dragIndex.value = null
  dragOverIndex.value = null
  if (from === null || to === null || from === to) return

  const prev = [...tracks.value]
  const [moved] = tracks.value.splice(from, 1)
  tracks.value.splice(to, 0, moved!)
  saving.value = true
  try {
    await $fetch(`/api/playlists/${playlistId.value}/tracks`, {
      method: 'PATCH',
      body: { orderedTrackIds: tracks.value.map((t) => t.id) },
    })
    toast.success('Playlist order saved.')
  } catch (err: any) {
    tracks.value = prev
    toast.error(apiErrorMessage(err, 'The order could not be saved.'))
  } finally {
    saving.value = false
  }
}

async function removeTrack(track: Track): Promise<void> {
  const prev = [...tracks.value]
  tracks.value = tracks.value.filter((t) => t.id !== track.id)
  try {
    await $fetch(`/api/playlists/${playlistId.value}/tracks/${track.id}`, { method: 'DELETE' })
    toast.success(`Removed from playlist.`)
  } catch (err: any) {
    tracks.value = prev
    toast.error(apiErrorMessage(err, 'Could not remove the track.'))
  }
}

async function deletePlaylist(): Promise<void> {
  try {
    await $fetch(`/api/playlists/${playlistId.value}`, { method: 'DELETE' })
    toast.success('Playlist deleted.')
    await navigateTo('/playlists')
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not delete the playlist.'))
  }
}

function onTracksAdded(added: Track[]): void {
  tracks.value.push(...added.filter((t) => !tracks.value.some((x) => x.id === t.id)))
}

onMounted(load)
useHead({ title: computed(() => playlist.value?.name ?? 'Playlist') })
</script>

<template>
  <div class="animate-fade-in">
    <div v-if="loading && !playlist" class="space-y-4">
      <Skeleton class="h-40 w-full rounded-pillow-lg" />
      <Skeleton class="h-16 w-full" />
    </div>

    <template v-else-if="playlist">
      <header class="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
        <div class="h-40 w-40 shrink-0 overflow-hidden rounded-pillow-lg shadow-soft-lg sm:h-44 sm:w-44">
          <TrackArtwork :artwork-key="playlist.artworkKey || tracks[0]?.artworkKey" :title="playlist.name" rounded="rounded-pillow-lg" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="mb-1 text-xs uppercase tracking-wider text-cream-faint">Playlist</p>
          <h1 class="font-display text-2xl font-semibold text-cream text-glow sm:text-3xl">
            {{ playlist.name }}
          </h1>
          <p v-if="playlist.description" class="mt-2 max-w-lg text-sm leading-relaxed text-cream-dim">
            {{ playlist.description }}
          </p>
          <p class="mt-2 text-sm text-cream-faint">
            {{ tracks.length }} {{ tracks.length === 1 ? 'track' : 'tracks' }}
            <span v-if="saving" class="ml-2 text-lavender-300">saving…</span>
          </p>

          <div class="mt-5 flex flex-wrap items-center gap-2">
            <Button :disabled="tracks.length === 0" @click="playAll">
              <Play class="h-4 w-4 fill-current" />
              Play
            </Button>
            <Button variant="secondary" :disabled="tracks.length === 0" @click="shuffleAll">
              <Shuffle class="h-4 w-4" />
              Shuffle
            </Button>
            <Button variant="ghost" @click="editOpen = true">
              <Pencil class="h-4 w-4" />
              Edit
            </Button>
            <Button variant="ghost" class="text-rose-200 hover:bg-rose-500/10" @click="deletePlaylist">
              <Trash2 class="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-sm font-medium text-cream-muted">Track order</h2>
        <Button variant="secondary" size="sm" @click="addOpen = true">
          <Plus class="h-4 w-4" />
          Add tracks
        </Button>
      </div>

      <EmptyState
        v-if="tracks.length === 0"
        title="This shelf is empty"
        description="Add a few songs and arrange them just so — drag to reorder."
      >
        <Button @click="addOpen = true">
          <Plus class="h-4 w-4" />
          Add tracks
        </Button>
      </EmptyState>

      <div v-else class="pillow flex flex-col gap-1 p-3">
        <div
          v-for="(track, i) in tracks"
          :key="track.id"
          class="rounded-pillow-sm transition-all duration-200"
          :class="{
            'bg-lavender-400/10 ring-1 ring-lavender-400/30': dragOverIndex === i,
            'opacity-60': dragIndex === i,
          }"
          draggable="true"
          @dragstart="onDragStart(i)"
          @dragover="onDragOver($event, i)"
          @dragleave="dragOverIndex === i && (dragOverIndex = null)"
          @drop="onDrop"
        >
          <TrackRow
            :track="track"
            :list="tracks"
            draggable
            :remove-label="`Remove ${track.title}`"
            @remove="removeTrack"
            @toggle="(fav) => (track.favourite = fav)"
          />
        </div>
      </div>

      <!-- edit dialog -->
      <PlaylistEditDialog v-model:open="editOpen" :playlist="playlist" @saved="load" />

      <!-- add tracks dialog -->
      <PlaylistAddTracksDialog
        v-model:open="addOpen"
        :playlist-id="playlist.id"
        :existing-ids="tracks.map((t) => t.id)"
        @added="onTracksAdded"
      />
    </template>
  </div>
</template>
