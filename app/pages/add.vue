<script setup lang="ts">
import { Download, Music, Pause, Play, Search } from 'lucide-vue-next'
import type { SearchResult } from '~/types/music'
import { useDownloadsStore } from '~/stores/downloads'
import { apiErrorMessage, useToast } from '~/composables/useToast'
import { useTrackPreview } from '~/composables/useTrackPreview'


const downloads = useDownloadsStore()
const toast = useToast()
const { playingUrl, togglePreview, stopPreview } = useTrackPreview()

const query = ref('')
const selected = ref<SearchResult | null>(null)
const submitting = ref(false)

const isPreviewingSelected = computed(
  () => !!selected.value?.previewUrl && playingUrl.value === selected.value.previewUrl,
)

function select(result: SearchResult): void {
  selected.value = result
}

async function doSearch(): Promise<void> {
  const q = query.value.trim()
  if (!q) {
    toast.error('Tell us what you are looking for.')
    return
  }
  stopPreview()
  selected.value = null
  await downloads.search(q)
}

async function startDownload(): Promise<void> {
  if (!selected.value) return
  stopPreview()
  submitting.value = true
  try {
    const { job, addedTrackId } = await downloads.createJob({
      sourceUrl: selected.value.url,
      title: selected.value.title,
      artist: selected.value.artist,
      duration: selected.value.duration,
      artworkUrl: selected.value.artworkUrl || selected.value.thumbnail || '',
      mbid: selected.value.mbid,
    })
    if (job) {
      toast.success('Added to the queue — it will appear in your library soon.')
    } else if (addedTrackId) {
      toast.success('This song was already saved — added to your library.')
    }
    selected.value = null
    query.value = ''
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'The download could not be started.'))
  } finally {
    submitting.value = false
  }
}

// A preview is a short listen — never keep it playing after leaving the page.
onUnmounted(stopPreview)

useHead({ title: 'Add Music' })
</script>

<template>
  <div class="mx-auto max-w-3xl animate-fade-in">
    <header class="mb-8 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pillow-lg bg-gradient-to-br from-plum-600/60 to-violet-700/40 shadow-glow">
        <Music class="h-6 w-6 text-lavender-200" />
      </div>
      <h1 class="font-display text-2xl font-semibold text-cream sm:text-3xl">Add Music</h1>
      <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-cream-dim">
        Search for a song, choose a result shorter than ten minutes, and Dreamy will gently
        download it into the library.
      </p>
    </header>

    <!-- search -->
    <form class="pillow flex items-center gap-2 p-2" @submit.prevent="doSearch">
      <Search class="ml-3 h-5 w-5 shrink-0 text-cream-faint" />
      <input
        v-model="query"
        type="text"
        placeholder="Song name or artist…"
        class="h-11 w-full bg-transparent text-sm text-cream placeholder:text-cream-dim/60 outline-none"
        aria-label="Search for a song"
      />
      <Button type="submit" :disabled="downloads.searching">
        {{ downloads.searching ? 'Searching…' : 'Search' }}
      </Button>
    </form>
    <p v-if="downloads.searchError" class="mt-3 text-center text-sm text-rose-200/90">
      {{ downloads.searchError }}
    </p>

    <!-- results -->
    <div v-if="downloads.results.length > 0" class="mt-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium text-cream-muted">
          {{ downloads.results.length }} result{{ downloads.results.length === 1 ? '' : 's' }}
        </h2>
        <p class="text-[11px] text-cream-faint">Results are limited to ten minutes</p>
      </div>
      <div class="flex flex-col gap-2.5">
        <SearchResultCard
          v-for="result in downloads.results"
          :key="result.id"
          :result="result"
          :selected="selected?.id === result.id"
          @select="select"
        />
      </div>

      <div v-if="selected" class="pillow mt-4 flex items-center justify-between gap-4 p-4 animate-fade-in-up">
        <div class="min-w-0">
          <p class="truncate text-sm text-cream">{{ selected.title }}</p>
          <p class="text-xs text-cream-dim">
            {{ selected.artist }}{{ selected.album ? ` · ${selected.album}` : '' }} · {{ formatDuration(selected.duration) }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button
            v-if="selected.previewUrl"
            variant="ghost"
            size="icon-sm"
            :aria-label="isPreviewingSelected ? 'Stop preview' : 'Preview this song'"
            :title="isPreviewingSelected ? 'Stop preview' : 'Listen to a 30-second preview'"
            @click="togglePreview(selected.previewUrl)"
          >
            <Pause v-if="isPreviewingSelected" class="h-4 w-4" />
            <Play v-else class="h-4 w-4" />
          </Button>
          <Button :disabled="submitting" class="shrink-0" @click="startDownload">
            <Download class="h-4 w-4" />
            {{ submitting ? 'Starting…' : 'Download' }}
          </Button>
        </div>
      </div>
    </div>

    <p v-else-if="downloads.searching" class="mt-10 text-center text-sm text-cream-dim">
      Listening for results…
    </p>
  </div>
</template>
