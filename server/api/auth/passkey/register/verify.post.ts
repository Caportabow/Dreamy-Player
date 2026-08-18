import { randomUUID } from 'node:crypto'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { db } from '../../../../db'
import { passkeys } from '../../../../db/schema'
import { getCurrentUser } from '../../../../utils/auth'
import { consumeChallenge, getWebAuthnConfig } from '../../../../utils/webauthn'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const { rpID, origin } = getWebAuthnConfig(event)
  const body = await readBody<RegistrationResponseJSON & { name?: string }>(event)

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: (challenge) => {
      const entry = consumeChallenge(challenge)
      return entry !== null && entry.userId === user.id
    },
    expectedOrigin: origin,
    expectedRPID: rpID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw createError({ statusCode: 400, statusMessage: 'Passkey verification failed. Please try again.' })
  }

  const { credential } = verification.registrationInfo
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 40)
      : 'Passkey'

  await db.insert(passkeys).values({
    id: randomUUID(),
    userId: user.id,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: JSON.stringify(body.response.transports ?? []),
    name,
  })

  return { ok: true }
})
