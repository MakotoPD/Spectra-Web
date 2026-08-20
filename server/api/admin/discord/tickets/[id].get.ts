// One ticket, with the HTML transcript the bot saved when it was closed.
//
// The transcript is returned as a string for the panel to drop into a sandboxed
// iframe rather than served as its own document: it is Discord message content
// turned into markup, which means it is user-written, and it must never run in
// this origin.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'bad ticket id' })
  }

  const row = await one<{
    id: string
    channel_id: string
    user_id: string
    topic: string | null
    status: string
    created: string
    closed: string | null
    closed_by: string | null
    transcript_html: string | null
  }>(
    `SELECT id, channel_id, user_id, topic, status, created, closed, closed_by, transcript_html
     FROM discord_tickets WHERE id = $1 AND guild_id = $2`,
    [id, cfg.guildId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'no such ticket' })

  const linked = await spectraAccountsFor([row.user_id])
  const spectra = linked.get(row.user_id) ?? null

  return {
    ticket: {
      id: Number(row.id),
      channelId: row.channel_id,
      userId: row.user_id,
      topic: row.topic,
      status: row.status,
      created: Number(row.created),
      closed: row.closed ? Number(row.closed) : null,
      closedBy: row.closed_by,
      transcript: row.transcript_html,
      spectra: spectra && {
        id: spectra.id,
        username: spectra.username,
        mcUsername: spectra.mcUsername,
      },
    },
  }
})
