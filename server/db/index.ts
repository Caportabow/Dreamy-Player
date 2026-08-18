import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL || 'postgres://dreamy:dreamy@localhost:5432/dreamy'

// `prepare: false` is required for postgres-js inside Nitro.
const client = postgres(connectionString, { prepare: false, max: 10 })

export const db = drizzle(client, { schema })

export type Database = typeof db
