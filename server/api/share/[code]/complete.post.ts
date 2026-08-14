// Step 2 of sharing a pack: the launcher says the object landed in R2.
//
// Everything that makes a code live happens here, so an upload that dies
// halfway changes nothing — a new code stays invisible, and a pushed update
// leaves the previous revision serving until its replacement is really there.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const code = normalizeCode(getRouterParam(event, 'code'))

  const db = useShareDb()
  const row = db
    .prepare('SELECT code, owner_id, revision, uploaded, object_key, pending_key, name FROM shares WHERE code = ?')
    .get(code) as {
      code: string
      owner_id: string | null
      revision: number
      uploaded: number
      object_key: string | null
      pending_key: string | null
      name: string | null
    } | undefined

  if (!row || row.owner_id !== me.id) {
    throw createError({ statusCode: 404, statusMessage: 'no such share' })
  }
  if (!row.pending_key) {
    throw createError({ statusCode: 409, statusMessage: 'nothing was being uploaded' })
  }

  // The key is derived, never taken from the client: whatever it uploaded to,
  // the only object this code will ever serve is the one we signed for.
  const revision = row.uploaded ? row.revision + 1 : row.revision
  if (row.pending_key !== packKey(code, revision)) {
    throw createError({ statusCode: 409, statusMessage: 'this upload is out of date' })
  }

  // Measure the object instead of believing the uploader: a presigned PUT has no
  // size limit of its own, so this is the only place an oversized pack can be
  // caught — and it is caught before the code serves it to anyone.
  const r2 = useR2()
  if (!r2) throw createError({ statusCode: 501, statusMessage: 'pack storage is not configured' })

  const stored = await r2Size(r2, row.pending_key)
  if (stored === null) {
    throw createError({ statusCode: 409, statusMessage: 'the pack never arrived in storage' })
  }
  if (stored > MAX_PACK_BYTES) {
    await r2Delete(r2, row.pending_key)
    db.prepare('UPDATE shares SET pending_key = NULL, pending_at = NULL WHERE code = ?').run(code)
    throw createError({
      statusCode: 413,
      statusMessage: `pack too large (${Math.round(stored / 1048576)} MB, max ${MAX_PACK_BYTES / 1073741824} GB)`,
    })
  }

  const previous = row.object_key
  const now = Date.now()
  db.prepare(
    `UPDATE shares SET object_key = @key, pending_key = NULL, pending_at = NULL, uploaded = 1,
            size = @size, revision = @revision, expires = @expires, blob = NULL
     WHERE code = @code`,
  ).run({
    code,
    key: row.pending_key,
    size: stored,
    revision,
    // A push restarts the week — the pack is current again.
    expires: expiryFor(now),
  })

  // The revision it replaced is nobody's download target now.
  if (previous && previous !== row.pending_key) await r2Delete(r2, previous)

  if (revision > 1) {
    const app = useAppDb()
    const recipients = app.prepare('SELECT user_id FROM share_recipient WHERE code = ?')
      .all(code) as { user_id: string }[]
    for (const r of recipients) {
      notify(app, {
        userId: r.user_id,
        kind: 'instance_update',
        actorId: me.id,
        shareCode: code,
        data: { name: row.name, revision },
      })
    }
  }

  return { code, revision, expires: expiryFor(now), pushed: revision > 1 }
})
