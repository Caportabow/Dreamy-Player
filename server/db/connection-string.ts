/**
 * Builds the Postgres connection string used by anything that talks to the
 * database on the host (Nuxt dev server, drizzle-kit, migrations).
 *
 * An explicit DATABASE_URL always wins — Docker Compose and production inject
 * it directly, and that keeps working unchanged. When it is absent, the URL is
 * derived from granular POSTGRES_* vars so the port is set in one place (.env)
 * instead of being hardcoded in several files.
 */
const str = (value: string | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value.trim() : fallback

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = str(env.DATABASE_URL, '')
  if (explicit) return explicit

  const host = str(env.POSTGRES_HOST, 'localhost')
  const port = str(env.POSTGRES_PORT, '5432')
  const user = str(env.POSTGRES_USER, 'dreamy')
  const password = str(env.POSTGRES_PASSWORD, 'dreamy')
  const database = str(env.POSTGRES_DB, 'dreamy')
  return `postgres://${user}:${password}@${host}:${port}/${database}`
}
