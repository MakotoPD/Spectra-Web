// Marks notifications read — the ids the client just displayed, or all of them.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { ids } = await readBody<{ ids?: number[] }>(event) ?? {}

  if (Array.isArray(ids) && ids.length) {
    const list = ids.slice(0, 200).map(Number).filter(Number.isFinite)
    if (!list.length) return { ok: true }
    await exec('UPDATE notification SET read = TRUE WHERE user_id = $1 AND id = ANY($2::bigint[])',
      [me.id, list])
  } else {
    await exec('UPDATE notification SET read = TRUE WHERE user_id = $1', [me.id])
  }
  return { ok: true }
})
