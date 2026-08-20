// Rewrites a message the bot posted earlier.
//
// Discord refuses to edit a message authored by anyone else, so the panel only
// ever offers this for its own — see `messages.get.ts`, which filters the list
// to this bot's user id.

const MAX_CONTENT = 2000

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{ channelId?: string, messageId?: string, content?: string }>(event) ?? {}
  const channelId = String(body.channelId ?? '')
  const messageId = String(body.messageId ?? '')
  const content = String(body.content ?? '').trim()

  if (!/^\d{17,20}$/.test(channelId) || !/^\d{17,20}$/.test(messageId)) {
    throw createError({ statusCode: 400, statusMessage: 'a channel id and a message id are required' })
  }
  if (!content) throw createError({ statusCode: 400, statusMessage: 'the message is empty' })
  if (content.length > MAX_CONTENT) {
    throw createError({
      statusCode: 400,
      statusMessage: `too long — ${content.length} characters, Discord allows ${MAX_CONTENT}`,
    })
  }

  await discordRequest(cfg, 'PATCH', `/channels/${channelId}/messages/${messageId}`, {
    content,
    // An edit that suddenly pings everyone would be a nasty surprise, and
    // Discord does re-notify on newly added mentions.
    allowed_mentions: { parse: [] },
  })

  return { ok: true }
})
