// Member lookup for the moderation forms.
//
// Discord's own search endpoint does the matching, so the panel never has to
// hold a copy of the member list. Each hit is then checked against `account` —
// a member who has signed into Spectra with Discord shows up with their
// username and Minecraft name attached, which is the difference between
// moderating a snowflake and moderating a person you can recognise.

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const cfg = requireDiscord()

  const query = String(getQuery(event).q ?? '').trim()
  if (query.length < 2) return { members: [] }

  const members = await discordRequest<{
    user: { id: string, username: string, global_name: string | null, avatar: string | null, bot?: boolean }
    nick: string | null
    roles: string[]
    joined_at: string
    communication_disabled_until: string | null
  }[]>(cfg, 'GET', `/guilds/${cfg.guildId}/members/search?query=${encodeURIComponent(query)}&limit=10`)

  const linked = await spectraAccountsFor(members.map(m => m.user.id))

  return {
    members: members.map((m) => {
      const spectra = linked.get(m.user.id) ?? null
      return {
        id: m.user.id,
        username: m.user.username,
        displayName: m.nick || m.user.global_name || m.user.username,
        avatar: m.user.avatar,
        bot: !!m.user.bot,
        joinedAt: m.joined_at,
        // Discord models a mute as "cannot talk until"; a past date is not one.
        mutedUntil: m.communication_disabled_until
          && new Date(m.communication_disabled_until) > new Date()
          ? m.communication_disabled_until
          : null,
        spectra: spectra && {
          id: spectra.id,
          username: spectra.username,
          mcUsername: spectra.mcUsername,
          banned: !!spectra.banned,
        },
      }
    }),
  }
})
