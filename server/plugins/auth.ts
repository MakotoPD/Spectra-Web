// Boot order matters here: better-auth creates the `user` table and
// `ensureSchema` adds everything that references it.
import { getMigrations } from 'better-auth/db/migration'
import { ensureSchema } from '../utils/schema'
import { backfillUsernames } from '../utils/username'

export default defineNitroPlugin(async () => {
  // Prerendering boots this server inside `docker build`, where the database
  // hostname does not resolve. Nothing to migrate at build time anyway.
  if (import.meta.prerender) return

  try {
    const { runMigrations } = await getMigrations(useAuth().options)
    await runMigrations()
    await ensureSchema()

    // Accounts made through a provider before usernames were generated for them
    // have none, which hides them from the friend search and gives them no
    // public profile. Cheap to re-check, and it doubles as a safety net.
    const filled = await backfillUsernames()
    if (filled) console.info(`[db] gave a username to ${filled} account(s)`)
  } catch (e) {
    console.error('[db] migration failed', e)
  }
})
