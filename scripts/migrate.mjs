/**
 * Applies Drizzle migrations. Plain ESM so it runs in the production image
 * with only runtime dependencies (drizzle-orm + postgres).
 *
 *   node scripts/migrate.mjs
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../server/db/migrations')

// Load .env when running on the host (mirrors drizzle.config.ts). The runner
// image has no dotenv, so this is best-effort and falls back to the real env.
try {
  const { config } = await import('dotenv')
  config()
} catch {
  // Production image: rely on environment variables injected by Docker.
}

const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${process.env.POSTGRES_USER || 'dreamy'}:${process.env.POSTGRES_PASSWORD || 'dreamy'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'dreamy'}`

const sql = postgres(connectionString, { max: 1 })

try {
  console.log('[migrate] Applying migrations from', migrationsFolder)
  await migrate(drizzle(sql), { migrationsFolder })
  console.log('[migrate] Done.')
} finally {
  await sql.end()
}
