// Creates/updates the auth tables on boot, the same way the telemetry and share
// databases migrate themselves — no CLI step to forget when deploying.
import { getMigrations } from 'better-auth/db/migration'

export default defineNitroPlugin(async () => {
  try {
    const { runMigrations } = await getMigrations(useAuth().options)
    await runMigrations()
    ensureSocialSchema(useAppDb())
  } catch (e) {
    console.error('[auth] migration failed', e)
  }
})
