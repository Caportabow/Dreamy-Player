import { resolveUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await resolveUser(event)
  return { user }
})
