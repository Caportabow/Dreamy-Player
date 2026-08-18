import { eq } from 'drizzle-orm'
import { db } from '../db'
import { playerState } from '../db/schema'
import type { TrackSnapshot } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

const REPEAT_MODES = ['off', 'queue', 'track']

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)
  const body = await readBody<{
    queue?: TrackSnapshot[]
    currentIndex?: number
    position?: number
    volume?: number
    muted?: boolean
    shuffle?: boolean
    repeatMode?: string
  }>(event)

  const values: Partial<typeof playerState.$inferInsert> = { updatedAt: new Date() }

  if (Array.isArray(body.queue)) values.queue = body.queue.slice(0, 500)
  if (typeof body.currentIndex === 'number') {
    values.currentIndex = Math.max(-1, Math.min(Math.round(body.currentIndex), 499))
  }
  if (typeof body.position === 'number') values.position = Math.max(0, Math.round(body.position))
  if (typeof body.volume === 'number') values.volume = Math.min(Math.max(body.volume, 0), 1)
  if (typeof body.muted === 'boolean') values.muted = body.muted
  if (typeof body.shuffle === 'boolean') values.shuffle = body.shuffle
  if (typeof body.repeatMode === 'string' && REPEAT_MODES.includes(body.repeatMode)) {
    values.repeatMode = body.repeatMode
  }

  await db
    .insert(playerState)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: playerState.userId, set: values })

  return { saved: true }
})
