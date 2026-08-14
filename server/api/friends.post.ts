// Sends a friend request. `query` is a username or an e-mail address — the
// e-mail is only ever used to look someone up, it is never echoed back.

/** Deliberately small: a stuck request queue is a spam vector. */
const MAX_PENDING_OUT = 25

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { query, userId } = await readBody<{ query?: string, userId?: string }>(event) ?? {}

  // Picked from the search list: no ambiguity about who this is meant for.
  const target = userId
    ? await getUser(String(userId))
    : await findUser(String(query ?? ''))
  // Same answer whether or not the account exists — otherwise this endpoint
  // turns into "is this e-mail registered with Spectra?".
  if (!target || target.id === me.id) {
    throw createError({ statusCode: 404, statusMessage: 'no such user' })
  }

  const existing = await one<{ id: number, status: string, requester_id: string }>(
    `SELECT id, status, requester_id FROM friendship
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [me.id, target.id],
  )

  if (existing) {
    if (existing.status === 'blocked') throw createError({ statusCode: 403, statusMessage: 'no such user' })
    // They already asked us — treat a second request as accepting theirs.
    if (existing.status === 'pending' && existing.requester_id === target.id) {
      await exec('UPDATE friendship SET status = $1 WHERE id = $2', ['accepted', existing.id])
      await notify({ userId: target.id, kind: 'friend_accepted', actorId: me.id })
      return { status: 'accepted', user: target }
    }
    return { status: existing.status, user: target }
  }

  const pending = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM friendship WHERE requester_id = $1 AND status = 'pending'",
    [me.id],
  )
  if ((pending?.n ?? 0) >= MAX_PENDING_OUT) {
    throw createError({ statusCode: 429, statusMessage: 'too many pending requests' })
  }

  await exec(
    'INSERT INTO friendship (requester_id, addressee_id, status, created) VALUES ($1, $2, $3, $4)',
    [me.id, target.id, 'pending', Date.now()],
  )
  await notify({ userId: target.id, kind: 'friend_request', actorId: me.id })

  return { status: 'pending', user: target }
})
