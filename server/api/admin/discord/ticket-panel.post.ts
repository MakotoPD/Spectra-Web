// Posts the "open a ticket" message — the one with the button members press.
//
// Sending it is a REST call, so it happens here. Reacting to the button is a
// gateway event, so that happens in the bot: it listens for the custom id
// `open_ticket` and takes it from there. The two halves only agree on that
// string, which is why it is spelled out in both places rather than derived.

const OPEN_TICKET_ID = 'open_ticket'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{ channelId?: string, title?: string, description?: string, label?: string }>(event) ?? {}
  const channelId = requireSnowflake(body.channelId, 'channelId')

  const title = String(body.title ?? 'Need a hand?').trim().slice(0, 256)
  const description = String(
    body.description ?? 'Press the button below and a private channel will open for you.',
  ).trim().slice(0, 4096)
  const label = String(body.label ?? 'Open a ticket').trim().slice(0, 80) || 'Open a ticket'

  const config = await one<{ ticket_category: string | null }>(
    'SELECT ticket_category FROM discord_config WHERE guild_id = $1', [cfg.guildId])
  // The button would open nothing without somewhere to put the channel, and a
  // dead button in a public channel is worse than no button.
  if (!config?.ticket_category) {
    throw createError({
      statusCode: 400,
      statusMessage: 'set a ticket category in Config before posting the panel',
    })
  }

  const sent = await discordRequest<{ id: string }>(
    cfg, 'POST', `/channels/${channelId}/messages`, {
      embeds: [{ color: 0x38bdf8, title, description }],
      components: [{
        type: 1,
        components: [{ type: 2, style: 1, label, emoji: { name: '🎫' }, custom_id: OPEN_TICKET_ID }],
      }],
      allowed_mentions: { parse: [] },
    })

  await exec(
    `INSERT INTO discord_config (guild_id, ticket_panel_channel) VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET ticket_panel_channel = EXCLUDED.ticket_panel_channel`,
    [cfg.guildId, channelId],
  )

  return { id: sent.id }
})
