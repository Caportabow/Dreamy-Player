import { randomBytes } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../db'
import { passkeys } from '../db/schema'

const CHALLENGE_TTL_MS = 5 * 60_000

interface ChallengeEntry {
  /** userId the challenge was minted for (registration), or null for login. */
  userId: string | null
  createdAt: number
}

// Ceremonies are short-lived and a single Nuxt process serves the whole app,
// so an in-memory store with expiry is enough. Challenges are single-use.
const challengeStore = new Map<string, ChallengeEntry>()

function pruneChallenges(): void {
  const now = Date.now()
  for (const [key, entry] of challengeStore) {
    if (now - entry.createdAt > CHALLENGE_TTL_MS) challengeStore.delete(key)
  }
}

export function issueChallenge(userId: string | null): string {
  pruneChallenges()
  const challenge = randomBytes(32).toString('base64url')
  challengeStore.set(challenge, { userId, createdAt: Date.now() })
  return challenge
}

export function consumeChallenge(challenge: string): ChallengeEntry | null {
  const entry = challengeStore.get(challenge)
  if (!entry) return null
  challengeStore.delete(challenge)
  if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) return null
  return entry
}

/**
 * Derive the WebAuthn relying-party id and origin from the request, so the app
 * works on localhost and behind the Cloudflare tunnel alike. Override with
 * WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN when the public hostname should be pinned.
 */
export function getWebAuthnConfig(event: H3Event): { rpID: string; origin: string } {
  const host = getRequestHost(event)
  const protocol = getRequestProtocol(event)
  const rpID = process.env.WEBAUTHN_RP_ID || host.split(':')[0].toLowerCase()
  const origin = process.env.WEBAUTHN_ORIGIN || `${protocol}://${host}`
  return { rpID, origin }
}

/** Public shape for the passkey management UI. */
export interface PasskeyInfo {
  id: string
  name: string
  createdAt: Date
  lastUsedAt: Date | null
}

export async function listPasskeysForUser(userId: string): Promise<PasskeyInfo[]> {
  const rows = await db
    .select({
      id: passkeys.id,
      name: passkeys.name,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(asc(passkeys.createdAt))
  return rows
}

export async function deletePasskeyForUser(passkeyId: string, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
    .returning({ id: passkeys.id })
  return deleted.length > 0
}
