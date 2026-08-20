// The welcome (or farewell) message as it is stored. Sending it is the bot's
// job — it happens on a gateway event, which this app has no connection for.

const TYPES = new Set(['welcome', 'farewell'])

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const type = String(getRouterParam(event, 'type') ?? '')
  if (!TYPES.has(type)) throw createError({ statusCode: 400, statusMessage: 'welcome or farewell' })

  const row = await one<{
    enabled: boolean
    channel_id: string | null
    message_type: string
    content: string
    embed_json: Record<string, unknown>
  }>(
    `SELECT enabled, channel_id, message_type, content, embed_json
     FROM discord_welcome WHERE guild_id = $1 AND event_type = $2`,
    [cfg.guildId, type],
  )

  return {
    // A guild that has never been configured gets the same shape as one that
    // has, so the form has nothing to special-case.
    config: {
      enabled: row?.enabled ?? false,
      channelId: row?.channel_id ?? null,
      messageType: row?.message_type ?? 'text',
      content: row?.content ?? '',
      embed: row?.embed_json ?? {},
    },
    // Substituted by the bot at send time, listed here so the editor can say so.
    variables: ['{username}', '{displayname}', '{mention}', '{servername}', '{membercount}', '{id}'],
  }
})
