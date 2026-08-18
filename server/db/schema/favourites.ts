import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { tracks } from './tracks'

export const favourites = pgTable(
  'favourites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.trackId] }),
    index('favourites_track_id_idx').on(t.trackId),
    index('favourites_created_at_idx').on(t.createdAt),
  ],
)

export const favouritesRelations = relations(favourites, ({ one }) => ({
  user: one(users, {
    fields: [favourites.userId],
    references: [users.id],
  }),
  track: one(tracks, {
    fields: [favourites.trackId],
    references: [tracks.id],
  }),
}))
