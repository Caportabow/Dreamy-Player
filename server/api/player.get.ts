import { eq } from 'drizzle-orm'
import { db } from '../db'
import { playerState } from '../db/schema'
import { getCurrentUser } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event)

  const state = await db.query.playerState.findFirst({
    where: eq(playerState.userId, user.id),
  })

  if (!state) return { state: null }

  return {
    state: {
      queue: state.queue,
      currentIndex: state.currentIndex,
      position: state.position,
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
    },
  }
})
