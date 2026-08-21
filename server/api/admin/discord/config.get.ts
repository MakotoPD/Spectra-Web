// Everything the bot reads out of the database, plus the channel and role lists
// the panel needs to render pickers for it.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const [config, roleRows, channels, roles] = await Promise.all([
    one<{
      log_channel: string | null
      ticket_category: string | null
      ticket_archive_category: string | null
      ticket_panel_channel: string | null
      ticket_prefix: string
      voice_hub: string | null
      voice_category: string | null
      release_channel: string | null
    }>(
      `SELECT log_channel, ticket_category, ticket_archive_category,
              ticket_panel_channel, ticket_prefix, voice_hub, voice_category,
              release_channel
       FROM discord_config WHERE guild_id = $1`,
      [cfg.guildId],
    ),
    q<{ role_id: string }>(
      'SELECT role_id FROM discord_ticket_roles WHERE guild_id = $1', [cfg.guildId]),
    guildChannels(cfg),
    assignableRoles(cfg),
  ])

  return {
    config: {
      logChannel: config?.log_channel ?? null,
      ticketCategory: config?.ticket_category ?? null,
      ticketArchiveCategory: config?.ticket_archive_category ?? null,
      ticketPanelChannel: config?.ticket_panel_channel ?? null,
      ticketPrefix: config?.ticket_prefix ?? 'ticket-',
      ticketRoles: roleRows.map(r => r.role_id),
      voiceHub: config?.voice_hub ?? null,
      voiceCategory: config?.voice_category ?? null,
      releaseChannel: config?.release_channel ?? null,
    },
    // Categories are what a ticket channel gets created *inside*, so they are
    // offered separately from the channels a message can be posted to.
    textChannels: channels
      .filter(c => c.type === 0 || c.type === 5)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name })),
    // Type 2 is a normal voice channel; 13 is a stage, which cannot be a hub.
    voiceChannels: channels
      .filter(c => c.type === 2)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name })),
    categories: channels
      .filter(c => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name })),
    roles,
  }
})
