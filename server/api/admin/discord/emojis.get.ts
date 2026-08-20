// The server's custom emoji, for the picker in the message builder.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()
  return { emojis: await guildEmojis(cfg) }
})
