// The channels the panel can post into, grouped by their category name.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()
  return { channels: await postableChannels(cfg) }
})
