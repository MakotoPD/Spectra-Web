// Overview of the Discord server for the admin panel's Discord tab.
//
// Everything here comes from Discord itself. The counts that will come from our
// own tables — warnings, tickets — arrive with the bot process; there is
// nothing to read for them yet, so nothing is reported.

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  // Not `requireDiscord`: the tab has to be able to render and say "not
  // configured" rather than showing the admin a 501.
  const cfg = useDiscord()
  if (!cfg) return { configured: false as const }

  const [guild, channels, me, counts] = await Promise.all([
    discordRequest<{
      name: string
      icon: string | null
      approximate_member_count: number
      approximate_presence_count: number
    }>(cfg, 'GET', `/guilds/${cfg.guildId}?with_counts=true`),
    guildChannels(cfg),
    botUser(cfg),
    // Ours, not Discord's — these are rows the bot writes. Zero until it runs.
    one<{ open: number, tickets: number, warnings: number }>(
      `SELECT
         (SELECT count(*)::int FROM discord_tickets WHERE guild_id = $1 AND status = 'open') AS open,
         (SELECT count(*)::int FROM discord_tickets WHERE guild_id = $1) AS tickets,
         (SELECT count(*)::int FROM discord_warnings WHERE guild_id = $1) AS warnings`,
      [cfg.guildId],
    ),
  ])

  return {
    configured: true as const,
    guild: {
      id: cfg.guildId,
      name: guild.name,
      // Discord serves the icon from its CDN by hash; the panel builds the URL.
      icon: guild.icon,
      memberCount: guild.approximate_member_count ?? 0,
      onlineCount: guild.approximate_presence_count ?? 0,
      channels: channels.filter(c => c.type !== 4).length,
      categories: channels.filter(c => c.type === 4).length,
    },
    bot: { id: me.id, username: me.username },
    openTickets: counts?.open ?? 0,
    tickets: counts?.tickets ?? 0,
    warnings: counts?.warnings ?? 0,
  }
})
