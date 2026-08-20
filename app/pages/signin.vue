<script setup lang="ts">
import { Fingerprint, LogIn } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'
import { usePlayerStore } from '~/stores/player'
import { usePasskeys, webauthnSupport, webauthnUnsupportedMessage, type WebAuthnSupport } from '~/composables/usePasskeys'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const route = useRoute()
const auth = useAuthStore()
const player = usePlayerStore()
const passkeys = usePasskeys()
const toast = useToast()

const username = ref('')
const password = ref('')
const loading = ref(false)
const passkeyLoading = ref(false)
const error = ref<string | null>(null)

// Passkeys need a secure context + a WebAuthn-capable browser. Evaluate on the
// client so the SSR render never flashes a wrong "unsupported" state.
const webauthn = ref<WebAuthnSupport | null>(null)
onMounted(() => {
  webauthn.value = webauthnSupport()
})

const nextPath = computed(() => (typeof route.query.next === 'string' ? route.query.next : '/'))
const cameFromGuest = computed(() => route.query.reason === 'guest')

async function finishSignIn(name: string): Promise<void> {
  await player.restore()
  // Navigate first, then toast: the welcome renders on the destination page
  // where the user is looking, and can never be wiped by the route change.
  await navigateTo(nextPath.value)
  toast.success(`Welcome back, ${name}.`)
}

async function submit(): Promise<void> {
  error.value = null
  loading.value = true
  try {
    await auth.signIn(username.value, password.value)
    await finishSignIn(auth.displayName)
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Sign-in failed. Please try again.')
  } finally {
    loading.value = false
  }
}

async function signInWithPasskey(): Promise<void> {
  error.value = null
  passkeyLoading.value = true
  try {
    await passkeys.signInWithPasskey(username.value || undefined)
    await finishSignIn(auth.displayName)
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Passkey sign-in failed. Please try again.')
  } finally {
    passkeyLoading.value = false
  }
}

if (auth.isSignedIn) navigateTo(nextPath.value)

useHead({ title: 'Sign in' })
</script>

<template>
  <div class="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
    <div class="w-full animate-fade-in-up">
      <div class="mb-8 flex flex-col items-center text-center">
        <AppLogo :size="56" class="mb-4" />
        <h1 class="font-display text-2xl font-semibold text-cream">Welcome back</h1>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-cream-dim">
          Sign in to keep your favourites, playlists, and listening story close.
        </p>
      </div>

      <form class="pillow flex flex-col gap-4 p-6" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="username">Username</Label>
          <Input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="dreamer"
            required
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="password">Password</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>

        <p v-if="error" class="rounded-pillow-sm bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {{ error }}
        </p>

        <Button type="submit" size="lg" :disabled="loading" class="mt-1">
          <LogIn class="h-4 w-4" />
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </Button>

        <div class="flex items-center gap-3">
          <span class="h-px flex-1 bg-white/8" />
          <span class="text-xs uppercase tracking-wider text-cream-faint">or</span>
          <span class="h-px flex-1 bg-white/8" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          :disabled="passkeyLoading || !webauthn?.supported"
          @click="signInWithPasskey"
        >
          <Fingerprint class="h-4 w-4" />
          {{ passkeyLoading ? 'Waiting for your passkey…' : 'Sign in with a passkey' }}
        </Button>
        <p v-if="webauthn && !webauthn.supported" class="text-center text-xs text-cream-faint">
          {{ webauthnUnsupportedMessage() }}
        </p>
      </form>

      <p class="mt-6 text-center text-sm text-cream-dim">
        New to Dreamy?
        <NuxtLink
          :to="{ path: '/signup', query: route.query }"
          class="text-lavender-300 underline-offset-4 hover:underline"
        >
          Create an account
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
