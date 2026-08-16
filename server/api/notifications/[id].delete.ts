// Throws one notification away for good.
//
// Marking it read only greys it out; this is the "I have dealt with it" button.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'bad id' })

  const gone = await exec('DELETE FROM notification WHERE id = $1 AND user_id = $2', [id, me.id])
  if (!gone) throw createError({ statusCode: 404, statusMessage: 'no such notification' })
  return { ok: true }
})
