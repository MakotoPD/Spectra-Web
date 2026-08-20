// Posts a message to a channel as the bot: text, embeds, buttons, or any mix.

const MAX_CONTENT = 2000

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{
    channelId?: string
    content?: string
    embeds?: unknown
    components?: unknown
    allowMentions?: boolean
  }>(event) ?? {}

  const channelId = requireSnowflake(body.channelId, 'channelId')
  const content = String(body.content ?? '').trim()

  if (content.length > MAX_CONTENT) {
    throw createError({
      statusCode: 400,
      statusMessage: `message is ${content.length} characters, Discord allows ${MAX_CONTENT}`,
    })
  }

  // Every limit and every style rule is checked here, so a mistake comes back
  // as a sentence rather than as Discord's nested 400.
  const embeds = cleanEmbeds(body.embeds)
  const components = cleanComponents(body.components)

  // Buttons alone are not a message — Discord needs something to attach them to.
  if (!content && !embeds.length) {
    throw createError({ statusCode: 400, statusMessage: 'add some text or an embed' })
  }

  const sent = await discordRequest<{ id: string }>(
    cfg, 'POST', `/channels/${channelId}/messages`, {
      ...(content ? { content } : {}),
      ...(embeds.length ? { embeds } : {}),
      ...(components.length ? { components } : {}),
      // Off by default: an accidental @everyone cannot be taken back, so the
      // pinging version has to be asked for. Mentions still render either way —
      // without this they simply do not notify anyone.
      allowed_mentions: body.allowMentions
        ? { parse: ['users', 'roles', 'everyone'] }
        : { parse: [] },
    })

  // Not an error: the id may well be for a handler about to be written. But a
  // button that answers "This interaction failed" is worth hearing about now
  // rather than from the first member who presses it.
  return { id: sent.id, unhandled: unhandledCustomIds(components) }
})
