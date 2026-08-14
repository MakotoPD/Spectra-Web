// Redeem endpoint. `GET /api/share/ABC123` sends the caller to the pack in
// storage; `?meta=1` returns just the metadata for the /s/:code landing page.
//
// The `expires > now` check does the real work — a code stops resolving the
// moment it lapses, whether or not the pruning pass has run yet.

export default defineEventHandler(async (event) => {
  setHeader(event, 'access-control-allow-origin', '*')

  const code = normalizeCode(getRouterParam(event, 'code'))
  if (code.length !== 6) {
    throw createError({ statusCode: 400, statusMessage: 'malformed code' })
  }

  const meta = getQuery(event).meta !== undefined
  const row = await one<any>(
    `SELECT code, created, expires, name, mc_version, loader, mods, size, downloads,
            owner_id, revision, object_key
     FROM shares WHERE code = $1 AND expires > $2 AND uploaded = TRUE`,
    [code, Date.now()],
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'this code does not exist or has expired' })
  }

  if (meta) {
    const { object_key, ...rest } = row
    return { ...rest, created: Number(rest.created), expires: Number(rest.expires), size: Number(rest.size) }
  }

  await exec('UPDATE shares SET downloads = downloads + 1 WHERE code = $1', [code])

  // Pulling an account-owned pack while signed in subscribes you to its updates:
  // the author's next push turns into a notification instead of a stale copy.
  if (row.owner_id) {
    const user = await optionalUser(event)
    if (user && user.id !== row.owner_id) {
      await exec(
        `INSERT INTO share_recipient (code, user_id, sent, imported_revision) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code, user_id) DO UPDATE SET imported_revision = EXCLUDED.imported_revision`,
        [code, user.id, Date.now(), row.revision],
      )
    }
  }

  if (!row.object_key) {
    throw createError({ statusCode: 404, statusMessage: 'this pack is no longer stored' })
  }

  const r2 = useR2()
  if (!r2) throw createError({ statusCode: 501, statusMessage: 'pack storage is not configured' })
  const url = await r2SignedGet(r2, row.object_key)

  // `?url=1` — for the launcher, which authenticates with a bearer token.
  // Following a redirect into R2 would carry that header along, and S3 refuses
  // a request that arrives with two different signatures. So it asks for the
  // address and fetches the bytes unauthenticated.
  if (getQuery(event).url !== undefined) return { url }

  // Browsers (the /s/<code> page) just follow it.
  return sendRedirect(event, url, 302)
})
