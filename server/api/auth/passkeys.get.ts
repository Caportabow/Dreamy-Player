import { getCurrentUser } from '../../utils/auth'
import { listPasskeysForUser } from '../../utils/webauthn'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const passkeys = await listPasskeysForUser(user.id)
  return { passkeys }
})
