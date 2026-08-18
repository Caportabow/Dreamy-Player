<script setup lang="ts">
import { Plus, Search } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const props = defineProps<{
  playlistId: string
  existingIds: string[]
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [tracks: Track[]] }>()

const toast = useToast()
const query = ref('')
const results = ref<Track[]>([])
const searching = ref(false)
const adding = ref<Set<string>>(new Set())
let timer: ReturnType<typeof setTimeout> | null = null

async function search(): Promise<void> {
  searching.value = true
  try {
    const res = await $fetch<{ tracks: Track[] }>('/api/tracks', {
      query: { search: query.value || undefined, limit: 30 },
    })
    results.value = res.tracks.filter((t) => !props.existingIds.includes(t.id))
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'The library could not be searched.'))
  } finally {
    searching.value = false
  }
}

watch(query, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(search, 300)
})

watch(open, (isOpen) => {
  if (isOpen) search()
})

async function add(track: Track): Promise<void> {
  adding.value.add(track.id)
  try {
    await $fetch(`/api/playlists/${props.playlistId}/tracks`, {
      method: 'POST',
      body: { trackId: track.id },
    })
    emit('added', [track])
    results.value = results.value.filter((t) => t.id !== track.id)
    toast.success(`Added “${track.title}”.`)
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not add the track.'))
  } finally {
    adding.value.delete(track.id)
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Add tracks</DialogTitle>
        <DialogDescription>Search the library and tap to add.</DialogDescription>
      </DialogHeader>

      <div class="relative">
        <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-faint" />
        <Input v-model="query" type="search" placeholder="Search the library…" class="pl-10" autofocus />
      </div>

      <div class="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        <div v-if="searching" class="space-y-2">
          <Skeleton v-for="i in 4" :key="i" class="h-14" />
        </div>
        <p v-else-if="query && results.length === 0" class="px-2 py-4 text-sm text-cream-dim">
          No matching songs to add.
        </p>
        <div
          v-for="track in results"
          :key="track.id"
          class="flex items-center gap-3 rounded-pillow-sm p-2 transition-colors hover:bg-white/5"
        >
          <div class="h-10 w-10 shrink-0 overflow-hidden rounded-pillow-sm">
            <TrackArtwork :artwork-key="track.artworkKey" :title="track.title" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-cream">{{ track.title }}</p>
            <p class="truncate text-xs text-cream-dim">{{ track.artist }}</p>
          </div>
          <Button
            variant="secondary"
            size="icon-sm"
            :disabled="adding.has(track.id)"
            aria-label="Add track"
            @click="add(track)"
          >
            <Plus class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
