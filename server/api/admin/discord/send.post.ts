// Posts a message to a channel as the bot.

const MAX_CONTENT = 2000

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{
    channelId?: string
    content?: string
    allowMentions?: boolean
  }>(event) ?? {}
  const channelId = String(body.channelId ?? '')
  const content = String(body.content ?? '').trim()

  if (!/^\d{17,20}$/.test(channelId)) {
    throw createError({ statusCode: 400, statusMessage: 'a channel id is required' })
  }
  if (!content) throw createError({ statusCode: 400, statusMessage: 'the message is empty' })
  // Discord's own limit. Checked here so an over-long message fails with a
  // sentence rather than with a 400 full of API JSON.
  if (content.length > MAX_CONTENT) {
    throw createError({
      statusCode: 400,
      statusMessage: `too long — ${content.length} characters, Discord allows ${MAX_CONTENT}`,
    })
  }

  const sent = await discordRequest<{ id: string }>(
    cfg, 'POST', `/channels/${channelId}/messages`, {
      content,
      // Off by default: an accidental @everyone cannot be taken back, so the
      // pinging version has to be asked for. Mentions still render either way —
      // without this they simply do not notify anyone.
      allowed_mentions: body.allowMentions
        ? { parse: ['users', 'roles', 'everyone'] }
        : { parse: [] },
    })

  return { id: sent.id }
})
