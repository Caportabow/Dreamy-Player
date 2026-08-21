import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { resolveDatabaseUrl } from './server/db/connection-string'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema/index.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
})
