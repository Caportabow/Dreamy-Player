import { defineStore } from 'pinia'
import type { AuthUser } from '~/types/music'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const restoring = ref(true)
  const restored = ref(false)

  const isSignedIn = computed(() => !!user.value)
  const displayName = computed(() => user.value?.profile?.displayName || 'Dreamer')

  /** Restore the session on app load. Safe to call repeatedly. */
  async function restore(): Promise<void> {
    if (restored.value) return
    restoring.value = true
    try {
      const res = await $fetch<{ user: AuthUser | null }>('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    } finally {
      restoring.value = false
      restored.value = true
    }
  }

  async function signIn(email: string, password: string): Promise<void> {
    const res = await $fetch<{ user: AuthUser }>('/api/auth/signin', {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
  }

  async function signUp(email: string, password: string): Promise<void> {
    const res = await $fetch<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password },
    })
    user.value = res.user
  }

  async function signOut(): Promise<void> {
    try {
      await $fetch('/api/auth/signout', { method: 'POST' })
    } catch {
      // Even if the request fails we clear locally.
    }
    user.value = null
  }

  function setUser(next: AuthUser | null): void {
    user.value = next
  }

  return {
    user,
    restoring,
    restored,
    isSignedIn,
    displayName,
    restore,
    signIn,
    signUp,
    signOut,
    setUser,
  }
})
