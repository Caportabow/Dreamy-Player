import { index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { playlists } from './playlists'
import { tracks } from './tracks'

export const playlistTracks = pgTable(
  'playlist_tracks',
  {
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    /** 0-based position within the playlist. */
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.playlistId, t.trackId] }),
    index('playlist_tracks_order_idx').on(t.playlistId, t.position),
  ],
)

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, {
    fields: [playlistTracks.trackId],
    references: [tracks.id],
  }),
}))
