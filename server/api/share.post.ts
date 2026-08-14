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
  // Signed in? The share belongs to the account, can be pushed to friends and
  // does not quietly expire in a week. Signed out, it is the old anonymous code.
  const owner = await optionalUser(event)
  const instanceId = clampStr(q.instance, 64) ?? null

  if (owner && instanceId) {
    const existing = db
      .prepare('SELECT code, revision FROM shares WHERE owner_id = ? AND instance_id = ?')
      .get(owner.id, instanceId) as { code: string, revision: number } | undefined

    // Re-sharing the same instance is a *push*: same code, next revision, so
    // everyone who already installed it keeps a working link.
    if (existing) {
      const revision = existing.revision + 1
      db.prepare(
        `UPDATE shares SET blob = @blob, size = @size, name = @name, mc_version = @mc_version,
                loader = @loader, mods = @mods, revision = @revision, expires = @expires
         WHERE code = @code`,
      ).run({
        code: existing.code,
        blob: body,
        size: body.length,
        name: clampStr(q.name, 80) ?? 'Minecraft instance',
        mc_version: clampStr(q.mc, 24) ?? null,
        loader: clampStr(q.loader, 24) ?? null,
        mods: Number(q.mods) || 0,
        revision,
        expires: now + OWNED_TTL_DAYS * 86_400_000,
      })
      notifyRecipients(existing.code, owner.id, clampStr(q.name, 80) ?? 'Minecraft instance', revision)
      return { code: existing.code, url: `${cfg.public.siteUrl}/s/${existing.code}`, revision, pushed: true }
    }
  }

  const expires = owner ? now + OWNED_TTL_DAYS * 86_400_000 : expiryFor(now)
  const code = newCode(db)

  db.prepare(
    `INSERT INTO shares (code, created, expires, name, mc_version, loader, mods, size, blob, owner_id, instance_id)
     VALUES (@code, @created, @expires, @name, @mc_version, @loader, @mods, @size, @blob, @owner_id, @instance_id)`,
  ).run({
    code,
    created: now,
    expires,
    owner_id: owner?.id ?? null,
    instance_id: instanceId,
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
    revision: 1,
    pushed: false,
  }
})

/** Tells everyone holding this code that a newer revision is up. */
function notifyRecipients(code: string, ownerId: string, name: string, revision: number) {
  const app = useAppDb()
  const recipients = app
    .prepare('SELECT user_id FROM share_recipient WHERE code = ?')
    .all(code) as { user_id: string }[]
  for (const r of recipients) {
    notify(app, {
      userId: r.user_id,
      kind: 'instance_update',
      actorId: ownerId,
      shareCode: code,
      data: { name, revision },
    })
  }
}
