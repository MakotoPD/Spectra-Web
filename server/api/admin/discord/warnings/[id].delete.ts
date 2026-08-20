// Removes one warning. Scoped to the configured guild so an id from somewhere
// else cannot be used to reach across into another server's history.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'bad warning id' })
  }

  const removed = await exec(
    'DELETE FROM discord_warnings WHERE id = $1 AND guild_id = $2', [id, cfg.guildId])
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'no such warning' })

  return { ok: true }
})
