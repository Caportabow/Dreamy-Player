<script setup lang="ts">
import type { Playlist } from '~/types/music'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const props = defineProps<{ playlist: Playlist }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const name = ref(props.playlist.name)
const description = ref(props.playlist.description || '')
const saving = ref(false)

watch(
  () => props.playlist,
  (p) => {
    name.value = p.name
    description.value = p.description || ''
  },
)

async function save(): Promise<void> {
  const trimmed = name.value.trim()
  if (!trimmed) {
    toast.error('Please give your playlist a name.')
    return
  }
  saving.value = true
  try {
    await $fetch(`/api/playlists/${props.playlist.id}`, {
      method: 'PATCH',
      body: { name: trimmed, description: description.value.trim() },
    })
    toast.success('Playlist updated.')
    open.value = false
    emit('saved')
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not save changes.'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>Edit playlist</DialogTitle>
        <DialogDescription>Update the name and description of this shelf.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-2">
          <Label for="edit-name">Name</Label>
          <Input id="edit-name" v-model="name" :maxlength="80" autofocus />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="edit-desc">Description</Label>
          <Textarea id="edit-desc" v-model="description" :maxlength="300" />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
