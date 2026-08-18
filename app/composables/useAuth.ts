import { useAuthStore } from '~/stores/auth'

export function useAuth() {
  const store = useAuthStore()

  const isSignedIn = computed(() => store.isSignedIn)
  const user = computed(() => store.user)
  const restoring = computed(() => store.restoring)
  const displayName = computed(() => store.displayName)

  return {
    store,
    user,
    isSignedIn,
    restoring,
    displayName,
    restore: store.restore,
    signIn: store.signIn,
    signUp: store.signUp,
    signOut: store.signOut,
    setUser: store.setUser,
  }
}
