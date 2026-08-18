<script setup lang="ts">
import type { Playlist } from '~/types/music'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [playlist: Playlist] }>()

const toast = useToast()
const name = ref('')
const description = ref('')
const creating = ref(false)

async function create(): Promise<void> {
  const trimmed = name.value.trim()
  if (!trimmed) {
    toast.error('Please give your playlist a name.')
    return
  }
  creating.value = true
  try {
    const res = await $fetch<{ playlist: Playlist }>('/api/playlists', {
      method: 'POST',
      body: { name: trimmed, description: description.value.trim() },
    })
    emit('created', res.playlist)
    name.value = ''
    description.value = ''
    open.value = false
    toast.success(`Created “${res.playlist.name}”.`)
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not create the playlist.'))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>New playlist</DialogTitle>
        <DialogDescription>A quiet shelf for the songs you love.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="create">
        <div class="flex flex-col gap-2">
          <Label for="playlist-name">Name</Label>
          <Input
            id="playlist-name"
            v-model="name"
            :maxlength="80"
            placeholder="Late night slow songs"
            autofocus
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="playlist-desc">Description <span class="text-cream-faint">(optional)</span></Label>
          <Textarea
            id="playlist-desc"
            v-model="description"
            :maxlength="300"
            placeholder="What this shelf holds…"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="creating">
            {{ creating ? 'Creating…' : 'Create playlist' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
