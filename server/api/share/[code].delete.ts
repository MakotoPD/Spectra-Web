// Kills a share code on the spot.
//
// The row stays (the admin dashboard charts history from it) but expires now,
// which is the same state a code reaches on its own after a week: the pack is
// deleted from storage and nothing resolves any more. Copies friends already
// installed keep working — they are files on their disks — they simply stop
// receiving updates.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const code = normalizeCode(getRouterParam(event, 'code'))

  const row = await one<{ owner_id: string | null, object_key: string | null }>(
    'SELECT owner_id, object_key FROM shares WHERE code = $1', [code])
  if (!row || row.owner_id !== me.id) {
    throw createError({ statusCode: 404, statusMessage: 'no such share' })
  }

  const r2 = useR2()
  if (row.object_key && r2) await r2Delete(r2, row.object_key)

  await exec(
    `UPDATE shares SET expires = $1, object_key = NULL, pending_key = NULL, pending_at = NULL
     WHERE code = $2`,
    [Date.now(), code],
  )
  // Nobody is on this code any more, so the recipient list is noise.
  await exec('DELETE FROM share_recipient WHERE code = $1', [code])

  return { ok: true }
})
