import { resolveUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  // Attach the authenticated user (or null for guests) to every API request.
  if (event.path.startsWith('/api/')) {
    event.context.user = await resolveUser(event)
  }
})
