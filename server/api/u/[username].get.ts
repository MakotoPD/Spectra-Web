// Public profile: the bits of an account that are safe to show a stranger —
// never the e-mail, never anything auth-related.

export default defineEventHandler(async (event) => {
  const username = String(getRouterParam(event, 'username') ?? '').toLowerCase()
  const user = await one<{ id: string, name: string, username: string, image: string | null, createdAt: string }>(
    'SELECT id, name, username, image, "createdAt" FROM "user" WHERE lower(username) = $1',
    [username],
  )
  if (!user) throw createError({ statusCode: 404, statusMessage: 'no such user' })

  return { user, friends: await friendsOf(user.id) }
})
