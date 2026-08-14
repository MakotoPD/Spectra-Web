// Public profile: the bits of an account that are safe to show a stranger —
// never the e-mail, never anything auth-related.

export default defineEventHandler((event) => {
  const db = useAppDb()
  const username = String(getRouterParam(event, 'username') ?? '').toLowerCase()
  const user = db
    .prepare('SELECT id, name, username, image, createdAt FROM user WHERE lower(username) = ?')
    .get(username) as { id: string, name: string, username: string, image: string | null, createdAt: string } | undefined
  if (!user) throw createError({ statusCode: 404, statusMessage: 'no such user' })

  return { user, friends: friendsOf(db, user.id) }
})
