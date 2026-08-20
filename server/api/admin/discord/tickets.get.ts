// Ticket list for the panel. Rows are written by the bot when someone opens or
// closes one; nothing here talks to Discord.

interface TicketRow {
  id: string
  channel_id: string
  user_id: string
  topic: string | null
  status: string
  created: string
  closed: string | null
  closed_by: string | null
  has_transcript: boolean
}

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const status = String(getQuery(event).status ?? 'all')
  const params: unknown[] = [cfg.guildId]
  let filter = ''
  if (status === 'open' || status === 'closed') {
    params.push(status)
    filter = ' AND status = $2'
  }

  // sql-safe: `filter` is a constant fragment chosen above, never request text
  const rows = await q<TicketRow>(
    `SELECT id, channel_id, user_id, topic, status, created, closed, closed_by,
            transcript_html IS NOT NULL AS has_transcript
     FROM discord_tickets
     WHERE guild_id = $1${filter}
     ORDER BY id DESC LIMIT 200`,
    params,
  )

  const linked = await spectraAccountsFor([...new Set(rows.map(r => r.user_id))])

  return {
    open: rows.filter(r => r.status === 'open').length,
    tickets: rows.map(r => ({
      id: Number(r.id),
      channelId: r.channel_id,
      userId: r.user_id,
      topic: r.topic,
      status: r.status,
      created: Number(r.created),
      closed: r.closed ? Number(r.closed) : null,
      closedBy: r.closed_by,
      hasTranscript: r.has_transcript,
      spectra: linked.get(r.user_id)?.username ?? null,
    })),
  }
})
