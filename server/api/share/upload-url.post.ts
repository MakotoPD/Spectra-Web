// Step 1 of sharing a pack: hand the launcher a URL it can PUT the zip to.
//
// The pack never passes through this server. Cloudflare rejects request bodies
// over 100 MB, and buffering a gigabyte in Node to write it into SQLite would be
// wrong even if it didn't — so the bytes go straight to R2 under a signature
// that is good for one object and one deadline.
//
// Step 2 is `share/[code]/complete.post.ts`, which is what actually makes the
// code resolve. An upload that never completes changes nothing.

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  if (cfg.ingestKey && getHeader(event, 'x-spectra-key') !== cfg.ingestKey) {
    throw createError({ statusCode: 401, statusMessage: 'invalid key' })
  }

  const r2 = useR2()
  if (!r2) throw createError({ statusCode: 501, statusMessage: 'pack storage is not configured' })

  // Gigabyte uploads are tied to an identity. Signed-out sharing still works
  // through the older route, which stays capped at what the proxy allows.
  const owner = await optionalUser(event)
  if (!owner) throw createError({ statusCode: 401, statusMessage: 'sign in to share large packs' })

  const body = await readBody<{
    size?: number
    name?: string
    mc?: string
    loader?: string
    mods?: number
    instance?: string
  }>(event) ?? {}

  const size = Number(body.size)
  if (!Number.isFinite(size) || size <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'missing pack size' })
  }
  if (size > MAX_PACK_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `pack too large (${Math.round(size / 1048576)} MB, max ${MAX_PACK_BYTES / 1073741824} GB)`,
    })
  }

  const db = useShareDb()
  await pruneShares(db)

  const now = Date.now()
  const instanceId = clampStr(body.instance, 64) ?? null
  const name = clampStr(body.name, 80) ?? 'Minecraft instance'
  const meta = {
    name,
    mc_version: clampStr(body.mc, 24) ?? null,
    loader: clampStr(body.loader, 24) ?? null,
    mods: Number(body.mods) || 0,
  }

  // Re-sharing the same instance keeps its code, so everyone who installed it
  // still has a working link. The revision is only bumped on completion.
  const existing = instanceId
    ? db.prepare('SELECT code, revision, uploaded FROM shares WHERE owner_id = ? AND instance_id = ?')
      .get(owner.id, instanceId) as { code: string, revision: number, uploaded: number } | undefined
    : undefined

  let code: string
  let revision: number

  if (existing) {
    code = existing.code
    // A first upload that never completed keeps its revision number.
    revision = existing.uploaded ? existing.revision + 1 : existing.revision
    db.prepare(
      `UPDATE shares SET name = @name, mc_version = @mc_version, loader = @loader, mods = @mods,
              pending_key = @pending_key, pending_at = @now WHERE code = @code`,
    ).run({ ...meta, code, pending_key: packKey(code, revision), now })
  } else {
    code = newCode(db)
    revision = 1
    db.prepare(
      `INSERT INTO shares (code, created, expires, name, mc_version, loader, mods, size,
                           owner_id, instance_id, revision, uploaded, pending_key, pending_at)
       VALUES (@code, @now, @expires, @name, @mc_version, @loader, @mods, 0,
               @owner_id, @instance_id, 1, 0, @pending_key, @now)`,
    ).run({
      ...meta,
      code,
      now,
      expires: expiryFor(now),
      owner_id: owner.id,
      instance_id: instanceId,
      pending_key: packKey(code, revision),
    })
  }

  return {
    code,
    revision,
    url: `${cfg.public.siteUrl}/s/${code}`,
    uploadUrl: await r2SignedPut(r2, packKey(code, revision), UPLOAD_URL_TTL),
    maxBytes: MAX_PACK_BYTES,
  }
})
