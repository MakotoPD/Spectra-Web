// Rewrites a message the bot posted earlier.
//
// Discord refuses to edit a message authored by anyone else, so the panel only
// ever offers this for its own — see `messages.get.ts`, which filters the list
// to this bot's user id.

const MAX_CONTENT = 2000

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const body = await readBody<{
    channelId?: string
    messageId?: string
    content?: string
    embeds?: unknown
    components?: unknown
  }>(event) ?? {}

  const channelId = requireSnowflake(body.channelId, 'channelId')
  const messageId = requireSnowflake(body.messageId, 'messageId')
  const content = String(body.content ?? '').trim()

  if (content.length > MAX_CONTENT) {
    throw createError({
      statusCode: 400,
      statusMessage: `message is ${content.length} characters, Discord allows ${MAX_CONTENT}`,
    })
  }

  const embeds = cleanEmbeds(body.embeds)
  const components = cleanComponents(body.components)

  if (!content && !embeds.length) {
    throw createError({ statusCode: 400, statusMessage: 'add some text or an embed' })
  }

  // Sent even when empty, unlike on create: omitting a key on a PATCH leaves it
  // as it was, so clearing the embeds off a message needs an explicit [].
  await discordRequest(cfg, 'PATCH', `/channels/${channelId}/messages/${messageId}`, {
    content: content || null,
    embeds,
    components,
    // An edit that suddenly pings everyone would be a nasty surprise, and
    // Discord does re-notify on mentions an edit newly introduces.
    allowed_mentions: { parse: [] },
  })

  return { ok: true, unhandled: unhandledCustomIds(components) }
})
