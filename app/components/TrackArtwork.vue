<script setup lang="ts">
import { Music } from 'lucide-vue-next'
import { mediaUrl } from '~/types/music'

const props = withDefaults(
  defineProps<{
    artworkKey: string | null | undefined
    title?: string
    rounded?: string
  }>(),
  { title: 'Track', rounded: 'rounded-pillow-sm' },
)

const src = computed(() => mediaUrl(props.artworkKey))

// Fade art in once it has actually loaded instead of popping in; the
// gradient placeholder shows underneath meanwhile.
const loaded = ref(false)
watch(src, () => {
  loaded.value = false
})
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden bg-gradient-to-br from-plum-700/50 via-night-800 to-night-850"
  >
    <img
      v-if="src"
      :src="src"
      :alt="title"
      loading="lazy"
      class="h-full w-full object-cover transition-opacity duration-500"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="loaded = true"
    />
    <div
      v-else
      class="flex h-full w-full items-center justify-center bg-gradient-to-br from-plum-700/45 via-violet-700/25 to-night-850"
    >
      <Music class="h-1/3 w-1/3 text-lavender-300/50" stroke-width="1.5" />
    </div>
  </div>
</template>
