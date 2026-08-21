export function useSignupStatus() {
  const { data } = useAsyncData<{ allowed: boolean }>('signup-status', () =>
    $fetch('/api/auth/signup-status')
  )
  return computed(() => data.value?.allowed ?? true)
}
