<template>
  <div class="noise min-h-screen">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Sonner rich-colors />
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { usePlayerStore } from '~/stores/player'
import { useDownloadsStore } from '~/stores/downloads'

const auth = useAuthStore()
const player = usePlayerStore()
const downloads = useDownloadsStore()

// Restore the player on initial load. Guests have no player at all, so
// restore() only acts for signed-in users; the watcher below also re-syncs
// after a fresh sign-in.
// Download jobs are polled app-wide (not per page) so the download progress
// indicator works from anywhere.
onMounted(() => {
  player.restore()
  void downloads.fetchJobs()
  if (downloads.hasActiveJobs) downloads.ensurePolling()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** Space toggles play/pause from anywhere — a music player's first instinct. */
function onKeydown(e: KeyboardEvent): void {
  if (e.code !== 'Space') return
  // Never hijack keys while typing or inside dialogs/menus/dropdowns.
  const target = e.target as HTMLElement | null
  if (
    target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="listbox"]')
  ) {
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  // The expanded player already owns the space key while it is open.
  if (player.isExpanded) return
  if (!player.current) return
  e.preventDefault()
  player.toggle()
}

// After sign-in/out, make sure player and download state land in the right
// store.
watch(
  () => auth.isSignedIn,
  async (signedIn) => {
    if (!signedIn) {
      downloads.stopPolling()
      return
    }
    // Server state is the source of truth for signed-in users; sync quietly.
    await player.restore()
    await downloads.fetchJobs()
    if (downloads.hasActiveJobs) downloads.ensurePolling()
  },
)
</script>
