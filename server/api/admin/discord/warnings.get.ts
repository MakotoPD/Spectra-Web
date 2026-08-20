// Warning history, newest first. Written by the bot's /warn command and by a
// ban issued from the panel; read here.

interface WarningRow {
  id: string
  user_id: string
  moderator_id: string
  reason: string | null
  created: string
}

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const userId = String(getQuery(event).userId ?? '')
  const params: unknown[] = [cfg.guildId]
  let filter = ''
  if (isSnowflake(userId)) {
    params.push(userId)
    filter = ' AND user_id = $2'
  }

  // sql-safe: `filter` is a constant fragment chosen above, never request text
  const rows = await q<WarningRow>(
    `SELECT id, user_id, moderator_id, reason, created
     FROM discord_warnings
     WHERE guild_id = $1${filter}
     ORDER BY id DESC LIMIT 100`,
    params,
  )

  const linked = await spectraAccountsFor([...new Set(rows.map(r => r.user_id))])

  return {
    warnings: rows.map(r => ({
      id: Number(r.id),
      userId: r.user_id,
      moderatorId: r.moderator_id,
      reason: r.reason,
      created: Number(r.created),
      spectra: linked.get(r.user_id)?.username ?? null,
    })),
  }
})
