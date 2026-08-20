// Boot order matters here: better-auth creates the `user` table and
// `ensureSchema` adds everything that references it.
import { getMigrations } from 'better-auth/db/migration'
import { ensureSchema } from '../utils/schema'

export default defineNitroPlugin(async () => {
  // Prerendering boots this server inside `docker build`, where the database
  // hostname does not resolve. Nothing to migrate at build time anyway.
  if (import.meta.prerender) return

  try {
    const { runMigrations } = await getMigrations(useAuth().options)
    await runMigrations()
    await ensureSchema()
  } catch (e) {
    console.error('[db] migration failed', e)
  }
})
