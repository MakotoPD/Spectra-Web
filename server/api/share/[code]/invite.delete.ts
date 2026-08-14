// Takes a friend off a shared pack. Their copy stays installed — this only
// stops future update notifications.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const code = normalizeCode(getRouterParam(event, 'code'))
  const { userId } = await readBody<{ userId?: string }>(event) ?? {}

  const owner = useShareDb().prepare('SELECT owner_id FROM shares WHERE code = ?')
    .get(code) as { owner_id: string | null } | undefined
  if (owner?.owner_id !== me.id) throw createError({ statusCode: 404, statusMessage: 'no such share' })

  useAppDb().prepare('DELETE FROM share_recipient WHERE code = ? AND user_id = ?').run(code, String(userId))
  return { ok: true }
})
