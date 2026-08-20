import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import type { PasskeyInfo } from '~/types/music'
import { useAuthStore } from '~/stores/auth'

/** Why WebAuthn may be unavailable in the current browser context. */
export type WebAuthnSupport =
  | { supported: true; reason?: undefined }
  | { supported: false; reason: 'insecure-context' | 'browser' }

/**
 * Whether the current browser can run WebAuthn ceremonies. WebAuthn is only
 * exposed in secure contexts (HTTPS or localhost) and in browsers with
 * PublicKeyCredential support. The SSR pass reports "unsupported", so callers
 * must re-check on the client (e.g. in onMounted) before rendering passkey UI.
 */
export function webauthnSupport(): WebAuthnSupport {
  if (import.meta.server) return { supported: false, reason: 'browser' }
  if (!window.isSecureContext) return { supported: false, reason: 'insecure-context' }
  if (typeof window.PublicKeyCredential !== 'function') return { supported: false, reason: 'browser' }
  return { supported: true }
}

/** A short, actionable explanation of why passkeys are unavailable. */
export function webauthnUnsupportedMessage(): string {
  const state = webauthnSupport()
  if (state.supported) return ''
  return state.reason === 'insecure-context'
    ? 'Passkeys need a secure connection. Open Dreamy over HTTPS (or via localhost) to use them.'
    : 'This browser does not support passkeys. Try a current version of Chrome, Edge, Safari, or Firefox.'
}

/** Replaces the library's bare error with the actionable explanation. */
function translateWebAuthnError(err: any): Error {
  if (err?.message === 'WebAuthn is not supported in this browser') {
    return new Error(webauthnUnsupportedMessage())
  }
  return err
}

/** A friendly, stable-ish name for a newly created passkey. */
export function defaultPasskeyName(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Android/.test(ua)) return 'Android'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Passkey'
}

/**
 * Module-scope reactive state shared by every usePasskeys() caller (profile
 * page, banner). Lets each caller react to passkeys added or removed anywhere
 * in the app, keyed to the user the count belongs to.
 */
const passkeysChanged = ref(0)
const passkeyCount = ref<number | null>(null)
const countUser = ref<string | null>(null)

/**
 * Passkey (WebAuthn) ceremonies. The browser half is dynamically imported so
 * this module never touches `navigator` during SSR.
 */
export function usePasskeys() {
  const auth = useAuthStore()

  async function registerPasskey(name?: string): Promise<void> {
    const support = webauthnSupport()
    if (!support.supported) throw new Error(webauthnUnsupportedMessage())
    const options = await $fetch<PublicKeyCredentialCreationOptionsJSON>(
      '/api/auth/passkey/register/options',
      { method: 'POST' },
    )
    const { startRegistration } = await import('@simplewebauthn/browser')
    let response
    try {
      response = await startRegistration({ optionsJSON: options })
    } catch (err: any) {
      throw translateWebAuthnError(err)
    }
    await $fetch('/api/auth/passkey/register/verify', {
      method: 'POST',
      body: { ...response, name },
    })
    passkeyCount.value = (passkeyCount.value ?? 0) + 1
    countUser.value = auth.user?.username ?? countUser.value
    passkeysChanged.value++
  }

  async function signInWithPasskey(username?: string): Promise<void> {
    const support = webauthnSupport()
    if (!support.supported) throw new Error(webauthnUnsupportedMessage())
    const options = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
      '/api/auth/passkey/login/options',
      { method: 'POST', body: { username } },
    )
    const { startAuthentication } = await import('@simplewebauthn/browser')
    let response
    try {
      response = await startAuthentication({ optionsJSON: options })
    } catch (err: any) {
      throw translateWebAuthnError(err)
    }
    const res = await $fetch<{ user: AuthUser }>('/api/auth/passkey/login/verify', {
      method: 'POST',
      body: response,
    })
    auth.setUser(res.user)
  }

  async function listPasskeys(): Promise<PasskeyInfo[]> {
    const res = await $fetch<{ passkeys: PasskeyInfo[] }>('/api/auth/passkeys')
    passkeyCount.value = res.passkeys.length
    countUser.value = auth.user?.username ?? null
    return res.passkeys
  }

  async function removePasskey(id: string): Promise<void> {
    await $fetch(`/api/auth/passkeys/${id}`, { method: 'DELETE' })
    passkeyCount.value = Math.max(0, (passkeyCount.value ?? 1) - 1)
    countUser.value = auth.user?.username ?? countUser.value
    passkeysChanged.value++
  }

  return {
    registerPasskey,
    signInWithPasskey,
    listPasskeys,
    removePasskey,
    passkeysChanged,
    passkeyCount,
    countUser,
  }
}
