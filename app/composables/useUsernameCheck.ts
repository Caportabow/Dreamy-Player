export type UsernameStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'taken'

// Mirrors server/utils/password.ts so we can short-circuit before fetching.
const USERNAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/
const USERNAME_MIN_LENGTH = 3
const USERNAME_MAX_LENGTH = 32

/**
 * Debounced live username check against GET /api/auth/username.
 *
 * `run(value, currentUsername?)` normalizes the input, validates the format
 * locally, then (after the debounce) asks the server whether it's taken.
 * When `currentUsername` is given and matches, it's treated as valid without
 * a request — used by the profile editor where your own username is fine.
 *
 * Out-of-order responses are ignored via a sequence counter.
 */
export function useUsernameCheck(debounceMs = 350) {
  const status = ref<UsernameStatus>('idle')
  const message = ref('')

  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  async function run(value: string, currentUsername?: string): Promise<void> {
    if (timer) clearTimeout(timer)
    const username = value.trim().toLowerCase()
    seq += 1
    const mySeq = seq

    if (!username) {
      status.value = 'idle'
      message.value = ''
      return
    }
    if (currentUsername && username === currentUsername.toLowerCase()) {
      status.value = 'valid'
      message.value = "That's your current username."
      return
    }
    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
      status.value = 'invalid'
      message.value = `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`
      return
    }
    if (!USERNAME_RE.test(username)) {
      status.value = 'invalid'
      message.value = 'Letters, numbers, dots, dashes, and underscores only.'
      return
    }

    status.value = 'checking'
    message.value = ''

    timer = setTimeout(async () => {
      try {
        const res = await $fetch<{ valid: boolean; taken?: boolean; error?: string }>(
          '/api/auth/username',
          { query: { username } },
        )
        if (mySeq !== seq) return
        if (!res.valid) {
          status.value = 'invalid'
          message.value = res.error ?? 'Invalid username.'
        } else if (res.taken) {
          status.value = 'taken'
          message.value = 'That username is already taken.'
        } else {
          status.value = 'valid'
          message.value = 'Username is available.'
        }
      } catch {
        if (mySeq !== seq) return
        // Network trouble — stay quiet; the server validates on submit anyway.
        status.value = 'idle'
        message.value = ''
      }
    }, debounceMs)
  }

  function dispose(): void {
    if (timer) clearTimeout(timer)
    seq += 1
  }

  return { status, message, run, dispose }
}
