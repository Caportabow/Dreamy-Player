<script setup lang="ts">
import { MoonStar, Sparkles } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'
import { usePlayerStore } from '~/stores/player'
import { apiErrorMessage, useToast } from '~/composables/useToast'

const route = useRoute()
const auth = useAuthStore()
const player = usePlayerStore()
const toast = useToast()

const email = ref('')
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const nextPath = computed(() => (typeof route.query.next === 'string' ? route.query.next : '/'))

async function submit(): Promise<void> {
  error.value = null
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  try {
    await auth.signUp(email.value, password.value)
    await player.restore()
    toast.success(`Welcome to Dreamy, ${auth.displayName}.`)
    await navigateTo(nextPath.value)
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
          <Label for="email">Email</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
          />
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

        <Button type="submit" size="lg" :disabled="loading" class="mt-1">
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

      <p class="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-cream-faint">
        <MoonStar class="h-3.5 w-3.5" />
        Guests can still browse and play the library.
      </p>
    </div>
  </div>
</template>
