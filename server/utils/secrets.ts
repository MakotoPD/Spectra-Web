// Server-side secrets, read the way the rest of this server reads them.
//
// The trap these exist to close: `runtimeConfig` in nuxt.config.ts is written as
// `adminToken: process.env.ADMIN_TOKEN || ''`, and that expression runs when the
// config is *built*. In a container that is `docker build`, where `.env` is
// deliberately absent (.dockerignore), so the value baked in is an empty string.
// At run time Nuxt only overrides it from a `NUXT_`-prefixed variable —
// `NUXT_ADMIN_TOKEN` — so a plain `ADMIN_TOKEN` sitting in the environment is
// never read, and the endpoint reports "not configured" while the variable is
// right there.
//
// DATABASE_URL, BETTER_AUTH_SECRET, the R2 keys and the Turnstile keys are all
// read straight from `process.env` and were never affected. These two were.
//
// Both spellings work: whatever runtimeConfig resolved to (i.e. NUXT_-prefixed),
// otherwise the plain variable from the process environment.

/** Admin dashboard token. Empty means "no admin access configured". */
export function adminToken(): string {
  return useRuntimeConfig().adminToken || process.env.ADMIN_TOKEN || ''
}

/**
 * Soft anti-spam key for the ingest routes — not a secret, it just keeps random
 * internet noise out. Empty disables the check.
 */
export function ingestKey(): string {
  return useRuntimeConfig().ingestKey || process.env.SPECTRA_INGEST_KEY || ''
}
