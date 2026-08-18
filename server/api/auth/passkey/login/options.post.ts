import { generateAuthenticationOptions } from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture, Base64URLString } from '@simplewebauthn/server'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { users } from '../../../../db/schema'
import { getWebAuthnConfig, issueChallenge } from '../../../../utils/webauthn'

export default defineEventHandler(async (event) => {
  const { rpID } = getWebAuthnConfig(event)
  const body = await readBody<{ username?: string }>(event)

  // When a username is given, only offer that user's passkeys (falling back to
  // discoverable credentials if they have none or the user is unknown).
  let allowCredentials: { id: Base64URLString; transports?: AuthenticatorTransportFuture[] }[] | undefined
  const rawUsername = typeof body.username === 'string' ? body.username.trim() : ''
  if (rawUsername) {
    const user = await db.query.users.findFirst({
      where: eq(users.username, rawUsername.toLowerCase()),
      with: { passkeys: true },
    })
    if (user && user.passkeys.length > 0) {
      allowCredentials = user.passkeys.map((p) => ({
        id: p.credentialId as Base64URLString,
        transports: JSON.parse(p.transports) as AuthenticatorTransportFuture[],
      }))
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    // Pass the challenge as raw bytes so it round-trips exactly (see
    // register/options.post.ts for why a string would not).
    challenge: Buffer.from(issueChallenge(null), 'base64url'),
  })

  return options
})
