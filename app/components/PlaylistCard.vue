<script setup lang="ts">
import { ListMusic, MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'
import type { Playlist } from '~/types/music'
import { useToast } from '~/composables/useToast'

const props = defineProps<{ playlist: Playlist }>()
const emit = defineEmits<{ deleted: [id: string]; renamed: [playlist: Playlist] }>()

const toast = useToast()
const editOpen = ref(false)
const name = ref(props.playlist.name)

async function rename(): Promise<void> {
  const next = name.value.trim()
  if (!next || next === props.playlist.name) {
    editOpen.value = false
    return
  }
  try {
    const res = await $fetch<{ playlist: Playlist }>(`/api/playlists/${props.playlist.id}`, {
      method: 'PATCH',
      body: { name: next },
    })
    emit('renamed', res.playlist)
    toast.success('Playlist renamed.')
    editOpen.value = false
  } catch (err: any) {
    toast.error(err?.data?.message || 'Could not rename the playlist.')
  }
}

async function remove(): Promise<void> {
  try {
    await $fetch(`/api/playlists/${props.playlist.id}`, { method: 'DELETE' })
    emit('deleted', props.playlist.id)
    toast.success('Playlist deleted.')
  } catch (err: any) {
    toast.error(err?.data?.message || 'Could not delete the playlist.')
  }
}
</script>

<template>
  <div class="pillow-card group relative flex flex-col overflow-hidden p-3">
    <NuxtLink :to="`/playlists/${playlist.id}`" class="mb-3 block aspect-square w-full overflow-hidden rounded-pillow-sm">
      <TrackArtwork :artwork-key="playlist.artworkKey" :title="playlist.name" />
    </NuxtLink>

    <NuxtLink :to="`/playlists/${playlist.id}`" class="min-w-0">
      <h3 class="truncate text-sm font-medium text-cream transition-colors group-hover:text-lavender-100">
        {{ playlist.name }}
      </h3>
      <p class="mt-0.5 flex items-center gap-1.5 text-xs text-cream-dim">
        <ListMusic class="h-3.5 w-3.5" />
        {{ playlist.trackCount }} {{ playlist.trackCount === 1 ? 'track' : 'tracks' }}
      </p>
    </NuxtLink>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          class="absolute right-3 top-3 rounded-full bg-night-950/45 text-cream-muted backdrop-blur-md transition-opacity hover:text-cream lg:opacity-0 lg:group-hover:opacity-100"
          aria-label="Playlist actions"
        >
          <MoreHorizontal class="h-4.5 w-4.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-48">
        <DropdownMenuItem @select="editOpen = true">
          <Pencil class="h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="text-rose-200 focus:text-rose-100" @select="remove">
          <Trash2 class="h-4 w-4" />
          Delete playlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog v-model:open="editOpen">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename playlist</DialogTitle>
          <DialogDescription>Give this shelf a new name.</DialogDescription>
        </DialogHeader>
        <form class="flex flex-col gap-4" @submit.prevent="rename">
          <Input v-model="name" :maxlength="80" autofocus placeholder="Playlist name" />
          <DialogFooter>
            <Button type="button" variant="ghost" @click="editOpen = false">Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
