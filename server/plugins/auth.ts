// Boot order matters here: better-auth creates the `user` table, `ensureSchema`
// adds everything that references it, and only then can old SQLite rows be
// copied in.
import { getMigrations } from 'better-auth/db/migration'
import { ensureSchema } from '../utils/schema'
import { importLegacySqlite } from '../utils/legacy-sqlite'

export default defineNitroPlugin(async () => {
  try {
    const { runMigrations } = await getMigrations(useAuth().options)
    await runMigrations()
    await ensureSchema()
  } catch (e) {
    console.error('[db] migration failed', e)
    return
  }

  // No-op unless a volume with the old files is mounted (LEGACY_SQLITE_DIR).
  // A failure here must not stop the site from coming up: the data is still in
  // the files, and the log says what went wrong.
  try {
    await importLegacySqlite()
  } catch (e) {
    console.error('[migrate] legacy import failed', e)
  }
})
