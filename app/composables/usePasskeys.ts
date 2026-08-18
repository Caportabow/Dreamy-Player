import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import type { PasskeyInfo } from '~/types/music'
import { useAuthStore } from '~/stores/auth'

/**
 * Passkey (WebAuthn) ceremonies. The browser half is dynamically imported so
 * this module never touches `navigator` during SSR.
 */
export function usePasskeys() {
  const auth = useAuthStore()

  async function registerPasskey(name?: string): Promise<void> {
    const options = await $fetch<PublicKeyCredentialCreationOptionsJSON>(
      '/api/auth/passkey/register/options',
      { method: 'POST' },
    )
    const { startRegistration } = await import('@simplewebauthn/browser')
    const response = await startRegistration({ optionsJSON: options })
    await $fetch('/api/auth/passkey/register/verify', {
      method: 'POST',
      body: { ...response, name },
    })
  }

  async function signInWithPasskey(username?: string): Promise<void> {
    const options = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
      '/api/auth/passkey/login/options',
      { method: 'POST', body: { username } },
    )
    const { startAuthentication } = await import('@simplewebauthn/browser')
    const response = await startAuthentication({ optionsJSON: options })
    const res = await $fetch<{ user: AuthUser }>('/api/auth/passkey/login/verify', {
      method: 'POST',
      body: response,
    })
    auth.setUser(res.user)
  }

  async function listPasskeys(): Promise<PasskeyInfo[]> {
    const res = await $fetch<{ passkeys: PasskeyInfo[] }>('/api/auth/passkeys')
    return res.passkeys
  }

  async function removePasskey(id: string): Promise<void> {
    await $fetch(`/api/auth/passkeys/${id}`, { method: 'DELETE' })
  }

  return {
    registerPasskey,
    signInWithPasskey,
    listPasskeys,
    removePasskey,
  }
}
