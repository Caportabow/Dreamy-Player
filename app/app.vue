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

const auth = useAuthStore()
const player = usePlayerStore()

// Restore the player on initial load (guests use their local cache; the
// sign-in watcher below handles the signed-in server state).
onMounted(() => {
  player.restore()
})

// After sign-in/out, make sure player state lands in the right store.
watch(
  () => auth.isSignedIn,
  async (signedIn) => {
    if (!signedIn) return
    // Server state is the source of truth for signed-in users; sync quietly.
    await player.restore()
  },
)
</script>
