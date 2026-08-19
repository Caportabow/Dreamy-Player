<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'
import { usePlayerStore } from '~/stores/player'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const route = useRoute()
const auth = useAuthStore()
const player = usePlayerStore()
const toast = useToast()

const username = ref('')
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const { status: usernameStatus, message: usernameMessage, run: checkUsername, dispose: disposeUsernameCheck } = useUsernameCheck()
watch(username, (v) => checkUsername(v))
onBeforeUnmount(disposeUsernameCheck)

const nextPath = computed(() => (typeof route.query.next === 'string' ? route.query.next : '/'))

async function finishSignUp(): Promise<void> {
  await player.restore()
  // Navigate first, then toast: the welcome renders on the destination page
  // where the user is looking, and can never be wiped by the route change.
  await navigateTo(nextPath.value)
  toast.success(`Welcome to Dreamy, ${auth.displayName}.`)
}

async function submit(): Promise<void> {
  error.value = null
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.'
    return
  }
  if (usernameStatus.value === 'taken' || usernameStatus.value === 'invalid') {
    error.value = usernameMessage.value
    return
  }
  loading.value = true
  try {
    await auth.signUp(username.value, password.value)
    await finishSignUp()
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Sign-up failed. Please try again.')
  } finally {
    loading.value = false
  }
}

if (auth.isSignedIn) navigateTo(nextPath.value)

useHead({ title: 'Create account' })
</script>

<template>
  <div class="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
    <div class="w-full animate-fade-in-up">
      <div class="mb-8 flex flex-col items-center text-center">
        <AppLogo :size="56" class="mb-4" />
        <h1 class="font-display text-2xl font-semibold text-cream">Make yourself at home</h1>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-cream-dim">
          A quiet place for your favourites, playlists, and listening story.
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
            minlength="3"
            maxlength="32"
            required
          />
          <p class="text-xs text-cream-faint">3–32 characters; letters, numbers, dots, dashes, underscores.</p>
          <p
            v-if="usernameStatus === 'checking'"
            class="text-xs text-cream-faint"
            aria-live="polite"
          >
            Checking availability…
          </p>
          <p
            v-else-if="usernameStatus === 'valid'"
            class="text-xs text-lavender-300"
            aria-live="polite"
          >
            {{ usernameMessage }}
          </p>
          <p
            v-else-if="usernameStatus === 'taken' || usernameStatus === 'invalid'"
            class="text-xs text-rose-300/90"
            aria-live="polite"
          >
            {{ usernameMessage }}
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="password">Password</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            placeholder="At least 8 characters"
            required
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="confirm">Confirm password</Label>
          <Input
            id="confirm"
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            placeholder="Again, softly"
            required
          />
        </div>

        <p v-if="error" class="rounded-pillow-sm bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {{ error }}
        </p>

        <Button
          type="submit"
          size="lg"
          :disabled="loading || usernameStatus === 'taken' || usernameStatus === 'invalid'"
          class="mt-1"
        >
          <Sparkles class="h-4 w-4" />
          {{ loading ? 'Creating…' : 'Create account' }}
        </Button>
      </form>

      <p class="mt-6 text-center text-sm text-cream-dim">
        Already have an account?
        <NuxtLink
          :to="{ path: '/signin', query: route.query }"
          class="text-lavender-300 underline-offset-4 hover:underline"
        >
          Sign in
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
