<script setup lang="ts">
import { ChevronDown, ChevronUp, Pencil, Play, Plus, Shuffle, Trash2 } from 'lucide-vue-next'
import type { Playlist, Track } from '~/types/music'
import { usePlayerStore } from '~/stores/player'
import { apiErrorMessage, useToast } from '~/composables/useToast'
import { usePlaylistChanges } from '~/composables/usePlaylistChanges'

const route = useRoute()
const toast = useToast()
const player = usePlayerStore()
const { bump: bumpPlaylistChanges } = usePlaylistChanges()

const playlistId = computed(() => String(route.params.id))
const playlist = ref<Playlist | null>(null)
const tracks = ref<Track[]>([])
const loading = ref(true)
const saving = ref(false)
const editOpen = ref(false)
const addOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)

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
    // The sidebar mirrors this playlist (name, artwork preview, track count)
    // but has no idea we changed — nudge it to reload.
    bumpPlaylistChanges()
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
  player.playTrackList(shuffleArray(tracks.value), 0)
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
  await persistOrder(prev)
}

/** Save the (already-optimistically-updated) order, rolling back on error. */
async function persistOrder(rollback: Track[]): Promise<void> {
  saving.value = true
  try {
    await $fetch(`/api/playlists/${playlistId.value}/tracks`, {
      method: 'PATCH',
      body: { orderedTrackIds: tracks.value.map((t) => t.id) },
    })
    bumpPlaylistChanges()
    toast.success('Playlist order saved.')
  } catch (err: any) {
    tracks.value = rollback
    toast.error(apiErrorMessage(err, 'The order could not be saved.'))
  } finally {
    saving.value = false
  }
}

/** Phones can't use HTML5 drag — move one step up/down instead. */
function moveTrack(index: number, delta: number): void {
  const to = index + delta
  if (to < 0 || to >= tracks.value.length) return
  const prev = [...tracks.value]
  const [moved] = tracks.value.splice(index, 1)
  tracks.value.splice(to, 0, moved!)
  void persistOrder(prev)
}

async function removeTrack(track: Track): Promise<void> {
  const prev = [...tracks.value]
  tracks.value = tracks.value.filter((t) => t.id !== track.id)
  try {
    await $fetch(`/api/playlists/${playlistId.value}/tracks/${track.id}`, { method: 'DELETE' })
    bumpPlaylistChanges()
    toast.success(`Removed from playlist.`)
  } catch (err: any) {
    tracks.value = prev
    toast.error(apiErrorMessage(err, 'Could not remove the track.'))
  }
}

async function deletePlaylist(): Promise<void> {
  deleting.value = true
  try {
    await $fetch(`/api/playlists/${playlistId.value}`, { method: 'DELETE' })
    toast.success('Playlist deleted.')
    await navigateTo('/playlists')
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not delete the playlist.'))
  } finally {
    deleting.value = false
  }
}

function onTracksAdded(added: Track[]): void {
  tracks.value.push(...added.filter((t) => !tracks.value.some((x) => x.id === t.id)))
  bumpPlaylistChanges()
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
            <Button variant="ghost" class="text-rose-200 hover:bg-rose-500/10" @click="deleteOpen = true">
              <Trash2 class="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      <div v-if="tracks.length > 0" class="mb-4 flex items-center justify-between">
        <h2 class="text-sm font-medium text-cream-muted">Track order</h2>
        <Button variant="secondary" size="sm" @click="addOpen = true">
          <Plus class="h-4 w-4" />
          Add tracks
        </Button>
      </div>

      <EmptyState
        v-if="tracks.length === 0"
        icon="playlist"
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
          class="flex items-center gap-1 rounded-pillow-sm transition-all duration-200"
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
          <!-- HTML5 drag is mouse-only; touch devices reorder with up/down -->
          <div class="hidden shrink-0 flex-col items-center [@media(pointer:coarse)]:flex">
            <button
              type="button"
              class="rounded-full p-1.5 text-cream-faint transition-colors hover:bg-white/8 hover:text-cream disabled:pointer-events-none disabled:opacity-30"
              :disabled="i === 0"
              :aria-label="`Move ${track.title} up`"
              @click.stop="moveTrack(i, -1)"
            >
              <ChevronUp class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="rounded-full p-1.5 text-cream-faint transition-colors hover:bg-white/8 hover:text-cream disabled:pointer-events-none disabled:opacity-30"
              :disabled="i === tracks.length - 1"
              :aria-label="`Move ${track.title} down`"
              @click.stop="moveTrack(i, 1)"
            >
              <ChevronDown class="h-4 w-4" />
            </button>
          </div>
          <div class="min-w-0 flex-1">
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
      </div>

      <!-- edit dialog -->
      <PlaylistEditDialog v-model:open="editOpen" :playlist="playlist" @saved="load" />

      <!-- delete confirmation -->
      <Dialog v-model:open="deleteOpen">
        <DialogContent class="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this playlist?</DialogTitle>
            <DialogDescription>
              “{{ playlist.name }}” and its track order will be gone. The songs stay in your
              library — only the shelf disappears.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" :disabled="deleting" @click="deleteOpen = false">
              Cancel
            </Button>
            <Button type="button" variant="destructive" :disabled="deleting" @click="deletePlaylist">
              <Trash2 class="h-4 w-4" />
              {{ deleting ? 'Deleting…' : 'Delete' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
