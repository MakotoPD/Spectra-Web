// Upload route for launchers older than the presigned-PUT flow: the pack comes
// in as a request body, and this server relays it into R2 rather than keeping
// it. Capped at what Cloudflare will pass through — current launchers ask
// `/api/share/upload-url` instead and are not limited by it.
//
// Metadata for the landing page comes from the query string so the server never
// has to open the archive: ?name=&mc=&loader=&mods=&instance=

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()

  // Same soft anti-spam key the telemetry ingest uses.
  const ingest = ingestKey()
  if (ingest && getHeader(event, 'x-spectra-key') !== ingest) {
    throw createError({ statusCode: 401, statusMessage: 'invalid key' })
  }

  const body = await readRawBody(event, false)
  if (!body?.length) {
    throw createError({ statusCode: 400, statusMessage: 'empty body' })
  }
  if (body.length > MAX_INLINE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `pack too large (${Math.round(body.length / 1048576)} MB, max `
        + `${MAX_INLINE_BYTES / 1048576} MB through this route — update the launcher `
        + `to upload straight to storage)`,
    })
  }

  const r2 = useR2()
  if (!r2) throw createError({ statusCode: 501, statusMessage: 'pack storage is not configured' })

  const q1 = getQuery(event)
  await pruneShares()

  const now = Date.now()
  const owner = await optionalUser(event)
  const instanceId = clampStr(q1.instance, 64) ?? null
  const meta = {
    name: clampStr(q1.name, 80) ?? 'Minecraft instance',
    mc_version: clampStr(q1.mc, 24) ?? null,
    loader: clampStr(q1.loader, 24) ?? null,
    mods: Number(q1.mods) || 0,
  }

  const existing = owner && instanceId
    ? await one<{ code: string, revision: number, object_key: string | null }>(
      'SELECT code, revision, object_key FROM shares WHERE owner_id = $1 AND instance_id = $2',
      [owner.id, instanceId],
    )
    : undefined

  // Re-sharing the same instance is a *push*: same code, next revision, so
  // everyone who already installed it keeps a working link.
  const code = existing?.code ?? await newCode()
  const revision = existing ? existing.revision + 1 : 1
  const key = packKey(code, revision)
  const expires = expiryFor(now)

  await r2Put(r2, key, body, 'application/zip')

  if (existing) {
    await exec(
      `UPDATE shares SET name = $1, mc_version = $2, loader = $3, mods = $4, size = $5,
              object_key = $6, revision = $7, expires = $8, uploaded = TRUE WHERE code = $9`,
      [meta.name, meta.mc_version, meta.loader, meta.mods, body.length, key, revision, expires, code],
    )
    if (existing.object_key && existing.object_key !== key) await r2Delete(r2, existing.object_key)

    const recipients = await q<{ user_id: string }>(
      'SELECT user_id FROM share_recipient WHERE code = $1', [code])
    for (const r of recipients) {
      await notify({
        userId: r.user_id,
        kind: 'instance_update',
        actorId: owner!.id,
        shareCode: code,
        data: { name: meta.name, revision },
      })
    }
  } else {
    await exec(
      `INSERT INTO shares (code, created, expires, name, mc_version, loader, mods, size,
                           owner_id, instance_id, revision, uploaded, object_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, TRUE, $11)`,
      [code, now, expires, meta.name, meta.mc_version, meta.loader, meta.mods, body.length,
        owner?.id ?? null, instanceId, key],
    )
  }

  return {
    code,
    url: `${cfg.public.siteUrl}/s/${code}`,
    expires,
    revision,
    pushed: !!existing,
  }
})
