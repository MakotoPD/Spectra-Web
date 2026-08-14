// Redeem endpoint. `GET /api/share/ABC123` streams the pack back to the
// launcher; `?meta=1` returns just the metadata for the /s/:code landing page.
//
// The `expires > now` check does the real work — a code stops resolving the
// moment it lapses, whether or not the pruning pass has run yet.

interface ShareRow {
  code: string
  created: number
  expires: number
  name: string | null
  mc_version: string | null
  loader: string | null
  mods: number
  size: number
  downloads: number
  owner_id: string | null
  revision: number
  blob?: Buffer
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'access-control-allow-origin', '*')

  const code = normalizeCode(getRouterParam(event, 'code'))
  if (code.length !== 6) {
    throw createError({ statusCode: 400, statusMessage: 'malformed code' })
  }

  const db = useShareDb()
  const meta = getQuery(event).meta !== undefined
  const columns = meta
    ? 'code, created, expires, name, mc_version, loader, mods, size, downloads, owner_id, revision'
    : '*'

  const row = db
    .prepare(`SELECT ${columns} FROM shares WHERE code = ? AND expires > ?`)
    .get(code, Date.now()) as ShareRow | undefined

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'this code does not exist or has expired' })
  }

  if (meta) return row

  db.prepare('UPDATE shares SET downloads = downloads + 1 WHERE code = ?').run(code)

  // Pulling an account-owned pack while signed in subscribes you to its updates:
  // the author's next push turns into a notification instead of a stale copy.
  if (row.owner_id) {
    const user = await optionalUser(event)
    if (user && user.id !== row.owner_id) {
      useAppDb().prepare(
        `INSERT INTO share_recipient (code, user_id, sent, imported_revision) VALUES (?, ?, ?, ?)
         ON CONFLICT(code, user_id) DO UPDATE SET imported_revision = excluded.imported_revision`,
      ).run(code, user.id, Date.now(), row.revision)
    }
  }

  setHeader(event, 'content-type', 'application/zip')
  setHeader(event, 'content-disposition', `attachment; filename="spectra-${code}.zip"`)
  return row.blob
})
