import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { playlistTracks } from './playlist-tracks'

export const playlists = pgTable(
  'playlists',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    artworkKey: text('artwork_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('playlists_user_id_idx').on(t.userId),
    index('playlists_created_at_idx').on(t.createdAt),
  ],
)

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(users, {
    fields: [playlists.userId],
    references: [users.id],
  }),
  tracks: many(playlistTracks),
}))
