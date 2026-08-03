// Upload endpoint for launcher share codes.
//
// Body: the raw `.zip` share pack (Content-Type: application/zip). Metadata for
// the landing page comes from the query string so the server never has to open
// the archive: ?name=&mc=&loader=&mods=
//
// Called from the launcher's Rust side (reqwest), so there is no CORS dance.

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()

  // Same soft anti-spam key the telemetry ingest uses.
  if (cfg.ingestKey && getHeader(event, 'x-spectra-key') !== cfg.ingestKey) {
    throw createError({ statusCode: 401, statusMessage: 'invalid key' })
  }

  const body = await readRawBody(event, false)
  if (!body?.length) {
    throw createError({ statusCode: 400, statusMessage: 'empty body' })
  }
  if (body.length > MAX_PACK_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `pack too large (${Math.round(body.length / 1048576)} MB, max ${MAX_PACK_BYTES / 1048576} MB)`,
    })
  }

  const q = getQuery(event)
  const db = useShareDb()
  pruneShares(db)

  const now = Date.now()
  const expires = expiryFor(now)
  const code = newCode(db)

  db.prepare(
    `INSERT INTO shares (code, created, expires, name, mc_version, loader, mods, size, blob)
     VALUES (@code, @created, @expires, @name, @mc_version, @loader, @mods, @size, @blob)`,
  ).run({
    code,
    created: now,
    expires,
    name: clampStr(q.name, 80) ?? 'Minecraft instance',
    mc_version: clampStr(q.mc, 24) ?? null,
    loader: clampStr(q.loader, 24) ?? null,
    mods: Number(q.mods) || 0,
    size: body.length,
    blob: body,
  })

  return {
    code,
    url: `${cfg.public.siteUrl}/s/${code}`,
    expires,
  }
})
