// Sends a friend request. `query` is a username or an e-mail address — the
// e-mail is only ever used to look someone up, it is never echoed back.

/** Deliberately small: a stuck request queue is a spam vector. */
const MAX_PENDING_OUT = 25

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { query } = await readBody<{ query?: string }>(event) ?? {}
  const db = useAppDb()

  const target = findUser(db, String(query ?? ''))
  // Same answer whether or not the account exists — otherwise this endpoint
  // turns into "is this e-mail registered with Spectra?".
  if (!target || target.id === me.id) {
    throw createError({ statusCode: 404, statusMessage: 'no such user' })
  }

  const existing = db
    .prepare(`SELECT id, status, requester_id FROM friendship
              WHERE (requester_id = @a AND addressee_id = @b) OR (requester_id = @b AND addressee_id = @a)`)
    .get({ a: me.id, b: target.id }) as { id: number, status: string, requester_id: string } | undefined

  if (existing) {
    if (existing.status === 'blocked') throw createError({ statusCode: 403, statusMessage: 'no such user' })
    // They already asked us — treat a second request as accepting theirs.
    if (existing.status === 'pending' && existing.requester_id === target.id) {
      db.prepare('UPDATE friendship SET status = ? WHERE id = ?').run('accepted', existing.id)
      notify(db, { userId: target.id, kind: 'friend_accepted', actorId: me.id })
      return { status: 'accepted', user: target }
    }
    return { status: existing.status, user: target }
  }

  const pending = db
    .prepare("SELECT count(*) AS n FROM friendship WHERE requester_id = ? AND status = 'pending'")
    .get(me.id) as { n: number }
  if (pending.n >= MAX_PENDING_OUT) {
    throw createError({ statusCode: 429, statusMessage: 'too many pending requests' })
  }

  db.prepare('INSERT INTO friendship (requester_id, addressee_id, status, created) VALUES (?, ?, ?, ?)')
    .run(me.id, target.id, 'pending', Date.now())
  notify(db, { userId: target.id, kind: 'friend_request', actorId: me.id })

  return { status: 'pending', user: target }
})
