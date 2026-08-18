import { resolveUser } from '../utils/auth'

// Endpoints that must stay reachable without a session:
//  - /api/auth/* — signing in/up and checking the current session
//  - /api/internal/* — download-worker callbacks (bearer-secret protected)
//  - /api/ping — health check
const PUBLIC_PREFIXES = ['/api/auth/', '/api/internal/', '/api/ping']

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  // Attach the authenticated user (or null for guests) to every API request.
  event.context.user = await resolveUser(event)
  if (event.context.user) return
  if (PUBLIC_PREFIXES.some((prefix) => event.path.startsWith(prefix))) return

  throw createError({
    statusCode: 401,
    statusMessage: 'Not signed in',
    message: 'Please sign in to keep your favourites, playlists, and listening story close.',
  })
})
