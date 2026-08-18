import { generateRegistrationOptions } from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture, Base64URLString } from '@simplewebauthn/server'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { passkeys } from '../../../../db/schema'
import { getCurrentUser } from '../../../../utils/auth'
import { getWebAuthnConfig, issueChallenge } from '../../../../utils/webauthn'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const { rpID } = getWebAuthnConfig(event)

  const existing = await db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, user.id))

  const options = await generateRegistrationOptions({
    rpName: 'Dreamy',
    rpID,
    userName: user.username,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.profile?.displayName || user.username,
    // Pass the challenge as raw bytes: as a string, generateRegistrationOptions
    // would UTF-8-encode it and return a different challenge than the one we
    // stored, breaking the verify-side lookup.
    challenge: Buffer.from(issueChallenge(user.id), 'base64url'),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId as Base64URLString,
      transports: JSON.parse(p.transports) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  return options
})
