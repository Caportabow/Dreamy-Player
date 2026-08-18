import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { passkeys } from '../../../../db/schema'
import { createSession, setSessionCookie, toAuthUser } from '../../../../utils/auth'
import { consumeChallenge, getWebAuthnConfig } from '../../../../utils/webauthn'

export default defineEventHandler(async (event) => {
  const { rpID, origin } = getWebAuthnConfig(event)
  const body = await readBody<AuthenticationResponseJSON>(event)

  const stored = await db.query.passkeys.findFirst({
    where: eq(passkeys.credentialId, body.id),
    with: { user: { with: { profile: true } } },
  })
  if (!stored) {
    throw createError({ statusCode: 400, statusMessage: 'That passkey is not registered here.' })
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: (challenge) => {
      const entry = consumeChallenge(challenge)
      return entry !== null && entry.userId === null
    },
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
    },
  })

  if (!verification.verified) {
    throw createError({ statusCode: 400, statusMessage: 'Passkey verification failed. Please try again.' })
  }

  await db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, stored.id))

  const token = await createSession(stored.user.id)
  setSessionCookie(event, token)

  return { user: toAuthUser(stored.user) }
})
