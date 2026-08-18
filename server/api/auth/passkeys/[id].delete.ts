import { getCurrentUser } from '../../../utils/auth'
import { deletePasskeyForUser } from '../../../utils/webauthn'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing passkey id.' })

  const deleted = await deletePasskeyForUser(id, user.id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Passkey not found.' })

  return { ok: true }
})
