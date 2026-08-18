import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  if (!auth.isSignedIn) {
    return navigateTo({
      path: '/signin',
      query: { next: to.fullPath, reason: 'guest' },
    })
  }
})
