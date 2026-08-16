// Answers a friend request: accept, reject or block the person who sent it.
// Only the addressee can do this — the requester's "undo" is DELETE.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const { action } = await readBody<{ action?: string }>(event) ?? {}
  if (!['accept', 'reject', 'block'].includes(String(action))) {
    throw createError({ statusCode: 400, statusMessage: 'unknown action' })
  }

  const row = await one<{ id: number, requester_id: string, status: string }>(
    'SELECT id, requester_id, status FROM friendship WHERE id = $1 AND addressee_id = $2',
    [id, me.id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'no such request' })

  // Answered, so the prompt goes — whichever way it was answered.
  await clearNotifications(me.id, ['friend_request'], { actorId: row.requester_id })

  if (action === 'accept') {
    await exec("UPDATE friendship SET status = 'accepted' WHERE id = $1", [id])
    await notify({ userId: row.requester_id, kind: 'friend_accepted', actorId: me.id })
    return { status: 'accepted' }
  }
  if (action === 'block') {
    await exec("UPDATE friendship SET status = 'blocked' WHERE id = $1", [id])
    return { status: 'blocked' }
  }
  await exec('DELETE FROM friendship WHERE id = $1', [id])
  return { status: 'rejected' }
})
