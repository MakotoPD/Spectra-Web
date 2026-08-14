// Unfriends, or withdraws a request we sent. Either side of the row may do it.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const changes = useAppDb()
    .prepare('DELETE FROM friendship WHERE id = ? AND (requester_id = ? OR addressee_id = ?)')
    .run(id, me.id, me.id).changes
  if (!changes) throw createError({ statusCode: 404, statusMessage: 'no such friendship' })
  return { ok: true }
})
