// Sends an already-uploaded pack to friends: no new code, no new upload — just
// a row saying "they have it" plus a notification their launcher will pick up.
//
// Only accepted friends can be invited. Otherwise the share code turns into a
// way to push arbitrary files at any username on the site.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const code = normalizeCode(getRouterParam(event, 'code'))
  const { userIds } = await readBody<{ userIds?: string[] }>(event) ?? {}

  const share = useShareDb()
    .prepare('SELECT code, name, owner_id, revision FROM shares WHERE code = ? AND expires > ?')
    .get(code, Date.now()) as { code: string, name: string | null, owner_id: string | null, revision: number } | undefined
  if (!share || share.owner_id !== me.id) {
    throw createError({ statusCode: 404, statusMessage: 'no such share' })
  }

  const db = useAppDb()
  const targets = (userIds ?? []).slice(0, 50).filter(id => typeof id === 'string' && areFriends(db, me.id, id))

  const insert = db.prepare(
    `INSERT INTO share_recipient (code, user_id, sent) VALUES (?, ?, ?)
     ON CONFLICT(code, user_id) DO UPDATE SET sent = excluded.sent`,
  )
  for (const userId of targets) {
    insert.run(code, userId, Date.now())
    notify(db, {
      userId,
      kind: 'instance_invite',
      actorId: me.id,
      shareCode: code,
      data: { name: share.name, revision: share.revision },
    })
  }

  return { sent: targets.length }
})
