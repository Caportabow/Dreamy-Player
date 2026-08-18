import type { AuthUser } from '~/types/music'
import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin(async () => {
  const auth = useAuthStore()

  // Server-side render: forward the incoming request's cookies so the
  // initial HTML reflects the real session (plain $fetch would not).
  if (import.meta.server) {
    const requestFetch = useRequestFetch()
    try {
      const res = await requestFetch<{ user: AuthUser | null }>('/api/auth/me')
      auth.setUser(res.user)
    } catch {
      auth.setUser(null)
    }
    return
  }

  // Client: always re-validate against the live session cookie. The
  // server-rendered state is deliberately NOT treated as final here,
  // because the SSR fetch can be stale or missing entirely.
  await auth.restore()
})
