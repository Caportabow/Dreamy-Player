<script setup lang="ts">
import { Fingerprint, X } from 'lucide-vue-next'
import { defaultPasskeyName, usePasskeys } from '~/composables/usePasskeys'
import { apiErrorMessage, useToast } from '~/composables/useToast'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const passkeysApi = usePasskeys()
const toast = useToast()

// Per-account dismissal: dismissing on one account must not hide the
// suggestion for a different (e.g. freshly created) account on this browser.
function dismissKey(username: string): string {
  return `dreamy:passkey-nudge-dismissed:${username}`
}

function isDismissed(username: string): boolean {
  return localStorage.getItem(dismissKey(username)) === '1'
}

const show = ref(false)
const adding = ref(false)

/** Fetch the real passkey list and decide visibility. */
async function load(): Promise<void> {
  const username = auth.user?.username
  if (!username) return
  try {
    await passkeysApi.listPasskeys()
    show.value = passkeysApi.passkeyCount.value === 0 && !isDismissed(username)
  } catch {
    // Quietly hide on any error — this is a suggestion, not a gate.
    show.value = false
  }
}

/** Decide visibility from the shared count (no request) when it's fresh. */
function evaluate(): void {
  const username = auth.user?.username
  if (!username) {
    show.value = false
    return
  }
  if (isDismissed(username)) {
    show.value = false
    return
  }
  if (passkeysApi.countUser.value === username && passkeysApi.passkeyCount.value !== null) {
    show.value = passkeysApi.passkeyCount.value === 0
    return
  }
  void load()
}

// Re-evaluate whenever the signed-in user changes (sign-up, sign-in, sign-out):
// a fresh account with no passkeys should always see the suggestion once.
// The immediate run happens during SSR setup, where localStorage does not
// exist — bail so a full page load never 500s (the client re-runs on hydration).
watch(
  () => auth.user?.username,
  (username) => {
    if (import.meta.server) return
    if (!username) {
      show.value = false
      return
    }
    evaluate()
  },
  { immediate: true },
)

// React instantly to passkeys added/removed anywhere in the app — deleting
// the last passkey (e.g. on the profile page) brings the suggestion back.
watch([passkeysApi.passkeyCount, passkeysApi.countUser], () => {
  if (import.meta.server) return
  evaluate()
})

async function add(): Promise<void> {
  adding.value = true
  try {
    await passkeysApi.registerPasskey(defaultPasskeyName())
    show.value = false
    toast.success('Passkey saved.')
  } catch (err: any) {
    toast.error(apiErrorMessage(err, 'Could not save the passkey. You can try again in your profile.'))
  } finally {
    adding.value = false
  }
}

function dismiss(): void {
  if (auth.user) localStorage.setItem(dismissKey(auth.user.username), '1')
  show.value = false
}
</script>

<template>
  <div
    v-if="show"
    class="mb-4 flex flex-col gap-3 rounded-pillow-sm border border-lavender-400/20 bg-pillow-card p-4 shadow-soft sm:flex-row sm:items-center sm:gap-4 sm:p-5"
  >
    <div
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lavender-400/70 to-plum-600/70 text-night-950"
    >
      <Fingerprint class="h-5 w-5" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="font-display text-sm font-semibold text-cream">Make sign-in instant with a passkey</p>
      <p class="mt-0.5 text-sm text-cream-dim">
        Add a passkey to sign in with your face, fingerprint, or device — no password needed.
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button type="button" size="sm" :disabled="adding" @click="add">
        <Fingerprint class="h-4 w-4" />
        {{ adding ? 'Waiting…' : 'Add a passkey' }}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        class="px-2.5"
        :disabled="adding"
        aria-label="Dismiss suggestion"
        @click="dismiss"
      >
        <X class="h-4 w-4" />
      </Button>
    </div>
  </div>
</template>
