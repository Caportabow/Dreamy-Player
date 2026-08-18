import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { tracks } from './tracks'

export const downloadJobs = pgTable(
  'download_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * queued → searching → downloading → converting → uploading → complete
     * Any state may transition to failed.
     */
    status: text('status').notNull().default('queued'),
    /** Human friendly current stage label. */
    stage: text('stage'),
    /** 0-100 progress percentage. */
    progress: integer('progress').notNull().default(0),
    error: text('error'),
    errorCode: text('error_code'),
    query: text('query'),
    sourceUrl: text('source_url'),
    sourceId: text('source_id'),
    title: text('title'),
    artist: text('artist'),
    /** Seconds, validated by the worker before download. */
    duration: integer('duration'),
    artworkUrl: text('artwork_url'),
    trackId: text('track_id').references(() => tracks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('download_jobs_user_created_idx').on(t.userId, t.createdAt),
    index('download_jobs_status_idx').on(t.status),
  ],
)

export const downloadJobsRelations = relations(downloadJobs, ({ one }) => ({
  user: one(users, {
    fields: [downloadJobs.userId],
    references: [users.id],
  }),
  track: one(tracks, {
    fields: [downloadJobs.trackId],
    references: [tracks.id],
  }),
}))
