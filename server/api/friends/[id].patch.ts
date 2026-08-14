// Answers a friend request: accept, reject or block the person who sent it.
// Only the addressee can do this — the requester's "undo" is DELETE.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const { action } = await readBody<{ action?: string }>(event) ?? {}
  if (!['accept', 'reject', 'block'].includes(String(action))) {
    throw createError({ statusCode: 400, statusMessage: 'unknown action' })
  }

  const db = useAppDb()
  const row = db.prepare('SELECT * FROM friendship WHERE id = ? AND addressee_id = ?')
    .get(id, me.id) as { id: number, requester_id: string, status: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'no such request' })

  if (action === 'accept') {
    db.prepare("UPDATE friendship SET status = 'accepted' WHERE id = ?").run(id)
    notify(db, { userId: row.requester_id, kind: 'friend_accepted', actorId: me.id })
    return { status: 'accepted' }
  }
  if (action === 'block') {
    db.prepare("UPDATE friendship SET status = 'blocked' WHERE id = ?").run(id)
    return { status: 'blocked' }
  }
  db.prepare('DELETE FROM friendship WHERE id = ?').run(id)
  return { status: 'rejected' }
})
