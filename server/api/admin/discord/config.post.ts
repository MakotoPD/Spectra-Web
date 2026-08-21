// Saves the bot's guild configuration. The bot re-reads this on every event, so
// a change here takes effect on the next join or button click — no restart.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{
    logChannel?: string | null
    ticketCategory?: string | null
    ticketArchiveCategory?: string | null
    ticketPanelChannel?: string | null
    ticketPrefix?: string
    ticketRoles?: string[]
    voiceHub?: string | null
    voiceCategory?: string | null
    releaseChannel?: string | null
    releaseRole?: string | null
  }>(event) ?? {}

  // Every channel/category field is optional and clearable, so "not a
  // snowflake" and "explicitly empty" have to stay distinguishable.
  const id = (value: unknown, field: string) => {
    if (value === null || value === undefined || value === '') return null
    return requireSnowflake(value, field)
  }

  const prefix = String(body.ticketPrefix ?? 'ticket-')
    // Discord lowercases channel names and drops anything outside this set, so
    // a prefix containing more than this would silently not be the prefix.
    .toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) || 'ticket-'

  await exec(
    `INSERT INTO discord_config
       (guild_id, log_channel, ticket_category, ticket_archive_category,
        ticket_panel_channel, ticket_prefix, voice_hub, voice_category,
        release_channel, release_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (guild_id) DO UPDATE SET
       log_channel             = EXCLUDED.log_channel,
       ticket_category         = EXCLUDED.ticket_category,
       ticket_archive_category = EXCLUDED.ticket_archive_category,
       ticket_panel_channel    = EXCLUDED.ticket_panel_channel,
       ticket_prefix           = EXCLUDED.ticket_prefix,
       voice_hub               = EXCLUDED.voice_hub,
       voice_category          = EXCLUDED.voice_category,
       release_channel         = EXCLUDED.release_channel,
       release_role            = EXCLUDED.release_role`,
    [
      cfg.guildId,
      id(body.logChannel, 'logChannel'),
      id(body.ticketCategory, 'ticketCategory'),
      id(body.ticketArchiveCategory, 'ticketArchiveCategory'),
      id(body.ticketPanelChannel, 'ticketPanelChannel'),
      prefix,
      id(body.voiceHub, 'voiceHub'),
      id(body.voiceCategory, 'voiceCategory'),
      id(body.releaseChannel, 'releaseChannel'),
      id(body.releaseRole, 'releaseRole'),
    ],
  )

  if (Array.isArray(body.ticketRoles)) {
    const roles = body.ticketRoles.filter(isSnowflake)
    // Replace wholesale: the form always submits the complete set, and working
    // out a diff would only be a way to get it wrong.
    await exec('DELETE FROM discord_ticket_roles WHERE guild_id = $1', [cfg.guildId])
    if (roles.length) {
      await exec(
        `INSERT INTO discord_ticket_roles (guild_id, role_id)
         SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [cfg.guildId, roles],
      )
    }
  }

  return { ok: true }
})
