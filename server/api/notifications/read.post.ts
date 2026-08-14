// Marks notifications read — the ids the client just displayed, or all of them.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { ids } = await readBody<{ ids?: number[] }>(event) ?? {}
  const db = useAppDb()

  if (Array.isArray(ids) && ids.length) {
    const list = ids.slice(0, 200).map(Number).filter(Number.isFinite)
    if (!list.length) return { ok: true }
    db.prepare(`UPDATE notification SET read = 1 WHERE user_id = ? AND id IN (${list.map(() => '?').join(',')})`)
      .run(me.id, ...list)
  } else {
    db.prepare('UPDATE notification SET read = 1 WHERE user_id = ?').run(me.id)
  }
  return { ok: true }
})
