<script setup lang="ts">
import { ListPlus } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { useAuthStore } from '~/stores/auth'
import { useToast } from '~/composables/useToast'

const props = defineProps<{ track: Track }>()

const auth = useAuthStore()
const toast = useToast()

const open = ref(false)

function openDialog(): void {
  open.value = true
}
</script>

<template>
  <Tooltip content-class="z-[70]">
    <button
      type="button"
      class="rounded-full p-2 text-cream-faint transition-all duration-300 hover:bg-white/8 hover:text-cream"
      aria-label="Add to playlist"
      @click.stop="openDialog"
    >
      <ListPlus class="h-4 w-4" />
    </button>
    <template #content>Add to playlist</template>
  </Tooltip>

  <AddToPlaylistDialog v-model:open="open" :track="track" />
</template>
