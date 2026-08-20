// Recent messages in one channel that the panel is allowed to edit.
//
// Discord only lets an application edit its *own* messages, so the list is
// filtered to this bot's user id rather than to "any bot". Showing another
// bot's post here would offer an Edit button that can only ever answer 403.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const channelId = String(getQuery(event).channelId ?? '')
  // Snowflakes are decimal ids. Anything else is a typo or a probe, and it is
  // cheaper to reject it than to let it become part of a URL.
  if (!/^\d{17,20}$/.test(channelId)) {
    throw createError({ statusCode: 400, statusMessage: 'a channel id is required' })
  }

  const [messages, me] = await Promise.all([
    discordRequest<{
      id: string
      content: string
      author: { id: string, username: string }
      embeds: unknown[]
      components?: unknown[]
      timestamp: string
      edited_timestamp: string | null
    }[]>(cfg, 'GET', `/channels/${channelId}/messages?limit=50`),
    botUser(cfg),
  ])

  return {
    messages: messages
      .filter(m => m.author.id === me.id)
      .map(m => ({
        id: m.id,
        content: m.content ?? '',
        embeds: m.embeds ?? [],
        hasComponents: !!m.components?.length,
        timestamp: m.timestamp,
        editedAt: m.edited_timestamp,
      })),
  }
})
