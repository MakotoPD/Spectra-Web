// Takes a friend off a shared pack. Their copy stays installed — this only
// stops future update notifications.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const code = normalizeCode(getRouterParam(event, 'code'))
  const { userId } = await readBody<{ userId?: string }>(event) ?? {}

  const owner = await one<{ owner_id: string | null }>(
    'SELECT owner_id FROM shares WHERE code = $1', [code])
  if (owner?.owner_id !== me.id) throw createError({ statusCode: 404, statusMessage: 'no such share' })

  await exec('DELETE FROM share_recipient WHERE code = $1 AND user_id = $2', [code, String(userId)])
  return { ok: true }
})
