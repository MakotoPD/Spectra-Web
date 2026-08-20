// Ban, kick, mute, unmute and unban — all of them from the panel, all of them
// plain REST calls, none of them needing the bot process to be running.
//
// One endpoint rather than five files: the five differ by a verb and a URL and
// share every line of validation, logging and mod-log posting around them.
//
// Whatever happens here is also written to `discord_warnings`-adjacent history
// by way of the mod-log channel, the same one the bot's slash commands post to,
// so a moderator reading the log cannot tell — and does not need to care —
// whether an action came from Discord or from this panel.

import { exec, one } from '../../../utils/db'

type Action = 'ban' | 'kick' | 'mute' | 'unmute' | 'unban'

const ACTION_COLOURS: Record<Action, number> = {
  ban: 0xed4245,
  kick: 0xfaa61a,
  mute: 0xff9900,
  unmute: 0x57f287,
  unban: 0x57f287,
}

// Discord's own ceiling for a timeout.
const MAX_MUTE_MINUTES = 40320

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{
    action?: string
    userId?: string
    reason?: string
    minutes?: number
    deleteMessageSeconds?: number
  }>(event) ?? {}

  const action = String(body.action ?? '') as Action
  if (!['ban', 'kick', 'mute', 'unmute', 'unban'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'unknown action' })
  }
  const userId = requireSnowflake(body.userId, 'userId')
  const reason = String(body.reason ?? '').trim().slice(0, 400) || 'No reason given'

  const guild = `/guilds/${cfg.guildId}`
  switch (action) {
    case 'ban': {
      // Discord takes the purge window in seconds and only accepts 0–7 days.
      const seconds = Math.min(Math.max(Number(body.deleteMessageSeconds) || 0, 0), 604800)
      await discordRequest(cfg, 'PUT', `${guild}/bans/${userId}`, {
        delete_message_seconds: seconds,
      })
      break
    }
    case 'unban':
      await discordRequest(cfg, 'DELETE', `${guild}/bans/${userId}`)
      break
    case 'kick':
      await discordRequest(cfg, 'DELETE', `${guild}/members/${userId}`)
      break
    case 'mute': {
      const minutes = Math.min(Math.max(Number(body.minutes) || 0, 1), MAX_MUTE_MINUTES)
      await discordRequest(cfg, 'PATCH', `${guild}/members/${userId}`, {
        communication_disabled_until: new Date(Date.now() + minutes * 60_000).toISOString(),
      })
      break
    }
    case 'unmute':
      await discordRequest(cfg, 'PATCH', `${guild}/members/${userId}`, {
        communication_disabled_until: null,
      })
      break
  }

  await postModLog(cfg, {
    action,
    userId,
    reason,
    minutes: action === 'mute' ? Number(body.minutes) || 0 : undefined,
  })

  return { ok: true }
})

/**
 * Mirrors the action into the configured log channel, in the same shape the
 * bot's own commands use. Failure is swallowed: a missing or misconfigured log
 * channel must not undo a ban that already happened.
 */
async function postModLog(
  cfg: DiscordConfig,
  { action, userId, reason, minutes }: { action: Action, userId: string, reason: string, minutes?: number },
) {
  const config = await one<{ log_channel: string | null }>(
    'SELECT log_channel FROM discord_config WHERE guild_id = $1', [cfg.guildId])
  if (!config?.log_channel) return

  await discordRequest(cfg, 'POST', `/channels/${config.log_channel}/messages`, {
    embeds: [{
      color: ACTION_COLOURS[action],
      title: `🔨 ${action}`,
      fields: [
        { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
        { name: 'Moderator', value: 'Spectra admin panel', inline: true },
        ...(minutes ? [{ name: 'Duration', value: `${minutes} min`, inline: true }] : []),
        { name: 'Reason', value: reason, inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { parse: [] },
  }).catch(e => console.error('[discord] mod log', e))

  // A ban is the one action worth keeping our own record of, so the warnings
  // view can show it beside the warnings that led there.
  if (action === 'ban') {
    await exec(
      `INSERT INTO discord_warnings (guild_id, user_id, moderator_id, reason, created)
       VALUES ($1, $2, 'panel', $3, $4)`,
      [cfg.guildId, userId, `[ban] ${reason}`, Date.now()],
    ).catch(e => console.error('[discord] ban record', e))
  }
}
