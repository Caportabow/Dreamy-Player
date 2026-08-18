import { useAuthStore } from '~/stores/auth'

// Pages that must stay reachable without a session.
const PUBLIC_PAGES = ['/signin', '/signup']

export default defineNuxtRouteMiddleware((to) => {
  if (PUBLIC_PAGES.includes(to.path)) return
  const auth = useAuthStore()
  if (!auth.isSignedIn) {
    return navigateTo({
      path: '/signin',
      query: { next: to.fullPath, reason: 'guest' },
    })
  }
})
