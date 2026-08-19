import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { favourites } from './favourites'
import { playlistTracks } from './playlist-tracks'
import { playHistory } from './play-history'
import { userTracks } from './user-tracks'

export const tracks = pgTable(
  'tracks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist').notNull().default('Unknown artist'),
    album: text('album'),
    /** Duration in seconds. */
    duration: integer('duration').notNull(),
    audioKey: text('audio_key').notNull(),
    artworkKey: text('artwork_key'),
    sourceUrl: text('source_url').notNull(),
    /** YouTube video id, used for duplicate detection. */
    sourceId: text('source_id'),
    /** Apple iTunes track id — lets us spot the same song under a different YouTube upload. */
    itunesId: text('itunes_id'),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Set when the last holder removes the song from the library. The row is
     * retained (soft delete) so play history and statistics keep rendering —
     * only the audio file is freed. A re-download revives the row instead of
     * creating a duplicate.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('tracks_title_idx').on(t.title),
    index('tracks_artist_idx').on(t.artist),
    index('tracks_created_at_idx').on(t.createdAt),
    index('tracks_itunes_id_idx').on(t.itunesId),
    uniqueIndex('tracks_source_id_unique').on(t.sourceId),
  ],
)

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  addedByUser: one(users, {
    fields: [tracks.addedBy],
    references: [users.id],
  }),
  favourites: many(favourites),
  playlistEntries: many(playlistTracks),
  historyEntries: many(playHistory),
  libraryEntries: many(userTracks),
}))
