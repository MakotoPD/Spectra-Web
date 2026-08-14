// Unfriends, or withdraws a request we sent. Either side of the row may do it.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const changes = await exec(
    'DELETE FROM friendship WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)',
    [id, me.id],
  )
  if (!changes) throw createError({ statusCode: 404, statusMessage: 'no such friendship' })
  return { ok: true }
})
