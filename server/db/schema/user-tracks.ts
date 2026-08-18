import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { tracks } from './tracks'

/**
 * Which songs live in which user's library.
 *
 * `tracks` itself is a shared catalog — one row per unique song (deduplicated
 * by source id, so the same YouTube video is never stored twice) — and this
 * table is the per-user membership into it. "Adding" a song that already
 * exists in the catalog is just an insert here; no re-download happens.
 */
export const userTracks = pgTable(
  'user_tracks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.trackId] }),
    index('user_tracks_user_added_idx').on(t.userId, t.addedAt),
  ],
)

export const userTracksRelations = relations(userTracks, ({ one }) => ({
  user: one(users, {
    fields: [userTracks.userId],
    references: [users.id],
  }),
  track: one(tracks, {
    fields: [userTracks.trackId],
    references: [tracks.id],
  }),
}))
