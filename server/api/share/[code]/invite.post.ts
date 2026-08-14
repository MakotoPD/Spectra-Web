// Sends an already-uploaded pack to friends: no new code, no new upload — just
// a row saying "they have it" plus a notification their launcher will pick up.
//
// Only accepted friends can be invited. Otherwise the share code turns into a
// way to push arbitrary files at any username on the site.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const code = normalizeCode(getRouterParam(event, 'code'))
  const { userIds } = await readBody<{ userIds?: string[] }>(event) ?? {}

  const share = await one<{ code: string, name: string | null, owner_id: string | null, revision: number }>(
    'SELECT code, name, owner_id, revision FROM shares WHERE code = $1 AND expires > $2',
    [code, Date.now()],
  )
  if (!share || share.owner_id !== me.id) {
    throw createError({ statusCode: 404, statusMessage: 'no such share' })
  }

  let sent = 0
  for (const userId of (userIds ?? []).slice(0, 50)) {
    if (typeof userId !== 'string' || !(await areFriends(me.id, userId))) continue
    await exec(
      `INSERT INTO share_recipient (code, user_id, sent) VALUES ($1, $2, $3)
       ON CONFLICT (code, user_id) DO UPDATE SET sent = EXCLUDED.sent`,
      [code, userId, Date.now()],
    )
    await notify({
      userId,
      kind: 'instance_invite',
      actorId: me.id,
      shareCode: code,
      data: { name: share.name, revision: share.revision },
    })
    sent++
  }

  return { sent }
})
