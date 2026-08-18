import { boolean, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'

/** A compact snapshot of a track stored in the player queue. */
export interface TrackSnapshot {
  id: string
  title: string
  artist: string
  album: string | null
  duration: number
  audioKey: string
  artworkKey: string | null
}

export const playerState = pgTable('player_state', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  queue: jsonb('queue').notNull().default([]).$type<TrackSnapshot[]>(),
  currentIndex: integer('current_index').notNull().default(-1),
  position: integer('position').notNull().default(0),
  volume: real('volume').notNull().default(0.8),
  muted: boolean('muted').notNull().default(false),
  shuffle: boolean('shuffle').notNull().default(false),
  repeatMode: text('repeat_mode').notNull().default('off'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const playerStateRelations = relations(playerState, ({ one }) => ({
  user: one(users, {
    fields: [playerState.userId],
    references: [users.id],
  }),
}))
