<script setup lang="ts">
import { Heart } from 'lucide-vue-next'
import type { Track } from '~/types/music'
import { useAuthStore } from '~/stores/auth'
import { useLibraryStore } from '~/stores/library'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const props = defineProps<{ track: Track }>()

const emit = defineEmits<{ toggle: [favourite: boolean] }>()

const auth = useAuthStore()
const library = useLibraryStore()
const toast = useToast()

const isFavourite = computed(() => props.track.favourite ?? library.favouriteIds.has(props.track.id))

async function toggle(): Promise<void> {
  if (!auth.isSignedIn) {
    toast.info('Sign in to keep your favourites, playlists, and listening story close.')
    return
  }
  const target = !isFavourite.value
  try {
    const ok = await library.toggleFavourite(props.track)
    if (ok) {
      emit('toggle', target)
      toast.success(target ? 'Added to your favourites.' : 'Removed from favourites.')
    }
  } catch (err: any) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <Tooltip content-class="z-[70]">
    <button
      type="button"
      class="rounded-full p-2 text-cream-faint transition-all duration-300 hover:bg-white/8 hover:text-cream"
      :class="isFavourite ? 'text-lavender-300 hover:text-lavender-200' : ''"
      :aria-label="isFavourite ? 'Remove from favourites' : 'Add to favourites'"
      @click.stop="toggle"
    >
      <Heart class="h-4 w-4" :class="isFavourite ? 'fill-lavender-300' : ''" />
    </button>
    <template #content>
      {{ isFavourite ? 'Remove from favourites' : 'Add to favourites' }}
    </template>
  </Tooltip>
</template>
