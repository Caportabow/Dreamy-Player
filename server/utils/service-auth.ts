import type { H3Event } from 'h3'
import { env } from './env'

/**
 * The download worker authenticates with the shared internal service secret.
 * Returns true when the request carries a valid credential.
 */
export function verifyServiceAuth(event: H3Event): boolean {
  const header = getHeader(event, 'authorization')
  if (!header) return false
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false
  return token === env.downloadServiceSecret
}

/** Throws a 401 when the internal credential is missing or invalid. */
export function requireServiceAuth(event: H3Event): void {
  if (!verifyServiceAuth(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized service request' })
  }
}

/** Authorization header for the Nuxt → worker direction. */
export function serviceAuthHeaders(): Record<string, string> {
  return { authorization: `Bearer ${env.downloadServiceSecret}` }
}
