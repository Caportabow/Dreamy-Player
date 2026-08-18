import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { tracks } from './tracks'

export const playHistory = pgTable(
  'play_history',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
    listenedSeconds: integer('listened_seconds').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
  },
  (t) => [
    index('play_history_user_played_idx').on(t.userId, t.playedAt),
    index('play_history_track_id_idx').on(t.trackId),
  ],
)

export const playHistoryRelations = relations(playHistory, ({ one }) => ({
  user: one(users, {
    fields: [playHistory.userId],
    references: [users.id],
  }),
  track: one(tracks, {
    fields: [playHistory.trackId],
    references: [tracks.id],
  }),
}))
