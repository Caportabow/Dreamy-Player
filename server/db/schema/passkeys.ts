import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'

export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // base64url-encoded credential id, as used by the WebAuthn API.
    credentialId: text('credential_id').notNull().unique(),
    // base64url-encoded COSE public key bytes from the authenticator.
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    // JSON array of AuthenticatorTransport values.
    transports: text('transports').notNull().default('[]'),
    name: text('name').notNull().default('Passkey'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('passkeys_user_id_idx').on(t.userId)],
)

export const passkeysRelations = relations(passkeys, ({ one }) => ({
  user: one(users, {
    fields: [passkeys.userId],
    references: [users.id],
  }),
}))
