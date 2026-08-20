// Accounts, for the admin panel's Users tab. Cookie-gated (see login.post.ts).
//
// Unlike `api/users.get.ts` — the friend-search type-ahead, which deliberately
// refuses to match on e-mail — this one shows the address and searches it too.
// The audience is the operator of the site, not another player.

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const query = getQuery(event)
  const search = String(query.q ?? '').trim().toLowerCase()
  // Bounded rather than paged: a panel that lists everyone is a panel that
  // stops loading once the site works. Narrow with the search box.
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500)

  const rows = await q<{
    id: string
    name: string | null
    username: string | null
    email: string
    image: string | null
    emailVerified: boolean
    banned: boolean | null
    mcUsername: string | null
    createdAt: string
    lastSeen: string | null
    friends: number
    shares: number
  }>(
    `SELECT u.id, u.name, u.username, u.email, u.image, u."emailVerified", u.banned,
            u."mcUsername", u."createdAt", u."lastSeen",
            (SELECT count(*)::int FROM friendship f
              WHERE f.status = 'accepted' AND (f.requester_id = u.id OR f.addressee_id = u.id)) AS friends,
            (SELECT count(*)::int FROM shares s WHERE s.owner_id = u.id) AS shares
     FROM "user" u
     WHERE $1 = ''
        OR lower(u.email) LIKE '%' || $1 || '%' ESCAPE '\'
        OR lower(coalesce(u.username, '')) LIKE '%' || $1 || '%' ESCAPE '\'
        OR lower(coalesce(u.name, '')) LIKE '%' || $1 || '%' ESCAPE '\'
        OR lower(coalesce(u."mcUsername", '')) LIKE '%' || $1 || '%' ESCAPE '\'
     ORDER BY u."createdAt" DESC
     LIMIT $2`,
    // `%` and `_` are LIKE wildcards, so an unescaped search box would let a
    // single `%` mean "everything" — harmless here, but the ranking would be
    // nonsense and the query would scan for no reason.
    [search.replace(/[\\%_]/g, c => `\\${c}`), limit],
  )

  const total = await one<{ n: number }>('SELECT count(*)::int AS n FROM "user"')

  return {
    total: total?.n ?? 0,
    users: rows.map(r => ({
      ...r,
      banned: !!r.banned,
      createdAt: new Date(r.createdAt).getTime(),
      lastSeen: r.lastSeen ? Number(r.lastSeen) : null,
    })),
  }
})
