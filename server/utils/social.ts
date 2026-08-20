// Friends and notifications, in the same Postgres database as the accounts they
// point at — so a friendship can foreign-key straight to `user` and disappear
// with the account it belonged to.
//
// Everything is quoted (`"user"`, `"emailVerified"`): `user` is a reserved word
// in Postgres, and better-auth creates its columns in camelCase.

import { exec, one, q } from './db'

export type FriendStatus = 'pending' | 'accepted' | 'blocked'
export type NotificationKind = 'friend_request' | 'friend_accepted' | 'instance_invite' | 'instance_update'

/** What a friend sees. Never the raw mode — 'hidden' must not be detectable. */
export type Status = 'online' | 'in_game' | 'dnd' | 'offline'

/** What the player chose for themselves. */
export type PresenceMode = 'visible' | 'dnd' | 'hidden'
export const PRESENCE_MODES: PresenceMode[] = ['visible', 'dnd', 'hidden']

/**
 * A launcher checks in every 30s; twice that plus a little covers a slow tick
 * or a missed one without leaving somebody "online" long after they closed it.
 */
export const PRESENCE_TIMEOUT_MS = 75_000

/**
 * The status a friend is allowed to see.
 *
 * Computed here rather than in the UI, so the raw mode never leaves the server:
 * "hidden" has to be indistinguishable from a closed launcher, which it is not
 * if the client is told to draw grey for a hidden friend.
 */
export function visibleStatus(row: {
  presence?: string | null
  lastSeen?: string | number | null
  playing?: boolean | null
}): Status {
  if ((row.presence ?? 'visible') === 'hidden') return 'offline'
  if (Number(row.lastSeen ?? 0) < Date.now() - PRESENCE_TIMEOUT_MS) return 'offline'
  if (row.playing) return 'in_game'
  return row.presence === 'dnd' ? 'dnd' : 'online'
}

/** Public shape of a user — never leak e-mail or anything auth-related. */
export interface PublicUser {
  id: string
  name: string | null
  username: string | null
  image: string | null
  /** The name they play under, once the launcher has linked it. */
  mcUsername?: string | null
}

const PUBLIC_COLUMNS = 'id, name, username, image, "mcUsername"'

/**
 * `%` and `_` are wildcards to LIKE, so an unescaped search box is a listing:
 * typing `%` alone matches every row. Escaped here — the exact-match half of
 * the search still compares the raw text, which is why it takes its own param.
 */
const likePrefix = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)

export function findUser(query: string) {
  const q1 = query.trim().toLowerCase()
  if (!q1) return Promise.resolve(undefined)
  // In-game name included: for most people that is the name their friends know
  // them by, and the one they will type.
  // sql-safe: PUBLIC_COLUMNS is a constant column list
  return one<PublicUser>(
    `SELECT ${PUBLIC_COLUMNS} FROM "user"
     WHERE lower(username) = $1 OR lower(email) = $1 OR lower("mcUsername") = $1
     LIMIT 1`,
    [q1],
  )
}

/**
 * People whose Spectra name or in-game name starts with what is being typed,
 * with their relationship to the searcher so the UI can say "already friends"
 * instead of offering a duplicate request.
 *
 * Deliberately no e-mail matching: a partial-match search over addresses turns
 * this into a way to ask "is this person registered?" for any address anyone
 * cares to try. Adding by full e-mail still works — that is someone typing an
 * address they already know, which is a different thing.
 */
export function searchUsers(query: string, meId: string) {
  const q1 = query.trim().toLowerCase()
  if (q1.length < 2) return Promise.resolve([])

  // sql-safe: PUBLIC_COLUMNS is a constant column list, prefixed with the alias
  return q<PublicUser & { relation: 'friend' | 'pending' | null }>(
    `SELECT ${PUBLIC_COLUMNS.split(', ').map(c => `u.${c}`).join(', ')},
            CASE f.status WHEN 'accepted' THEN 'friend' WHEN 'pending' THEN 'pending' ELSE NULL END AS relation
     FROM "user" u
     LEFT JOIN friendship f
       ON (f.requester_id = u.id AND f.addressee_id = $2)
       OR (f.addressee_id = u.id AND f.requester_id = $2)
     WHERE u.id <> $2
       AND (lower(u.username) LIKE $3 || '%' ESCAPE '\'
            OR lower(u."mcUsername") LIKE $3 || '%' ESCAPE '\')
       AND coalesce(f.status, '') <> 'blocked'
     -- Exact hits first, so typing a full name puts it at the top.
     ORDER BY (lower(u.username) = $1 OR lower(u."mcUsername") = $1) DESC,
              lower(coalesce(u.username, u."mcUsername"))
     LIMIT 8`,
    [q1, meId, likePrefix(q1)],
  )
}

export function getUser(id: string) {
  // sql-safe: PUBLIC_COLUMNS is a constant column list
  return one<PublicUser>(`SELECT ${PUBLIC_COLUMNS} FROM "user" WHERE id = $1`, [id])
}

/**
 * Accepted friends of `userId`, whichever side of the row they sit on. Carries
 * `friendshipId` so the UI can unfriend without a second lookup.
 */
export async function friendsOf(userId: string) {
  const rows = await q<any>(
    `SELECT u.id, u.name, u.username, u.image, u."mcUsername", u.presence, u."lastSeen", u.playing,
            f.id AS "friendshipId"
     FROM friendship f
     JOIN "user" u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY lower(coalesce(u.username, u.name))`,
    [userId],
  )
  return rows.map(({ presence, lastSeen, playing, ...user }) => ({
    ...user,
    status: visibleStatus({ presence, lastSeen, playing }),
  })) as (PublicUser & { friendshipId: number, status: Status })[]
}

/** Requests waiting for `userId` to answer (`incoming`) or to be answered. */
export async function pendingFor(userId: string) {
  const rows = await q<any>(
    `SELECT f.id, f.requester_id, f.addressee_id, f.created,
            u.id AS u_id, u.name, u.username, u.image, u."mcUsername"
     FROM friendship f
     JOIN "user" u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'pending' AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY f.created DESC`,
    [userId],
  )
  const map = (r: any) => ({
    id: Number(r.id),
    created: Number(r.created),
    user: { id: r.u_id, name: r.name, username: r.username, image: r.image, mcUsername: r.mcUsername } as PublicUser,
  })
  return {
    incoming: rows.filter(r => r.addressee_id === userId).map(map),
    outgoing: rows.filter(r => r.requester_id === userId).map(map),
  }
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await one(
    `SELECT 1 FROM friendship WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [a, b],
  )
  return !!row
}

/**
 * Drops the notifications an action has just answered.
 *
 * A notification is a prompt to do something; once it is done, leaving it in
 * the list is noise — and because the launcher polls, deleting it only in the
 * UI would bring it straight back on the next tick.
 */
export function clearNotifications(userId: string, kinds: NotificationKind[], opts: {
  actorId?: string
  shareCode?: string
} = {}) {
  return exec(
    `DELETE FROM notification
     WHERE user_id = $1 AND kind = ANY($2::text[])
       AND ($3::text IS NULL OR actor_id = $3)
       AND ($4::text IS NULL OR share_code = $4)`,
    [userId, kinds, opts.actorId ?? null, opts.shareCode ?? null],
  )
}

export function notify(n: {
  userId: string
  kind: NotificationKind
  actorId?: string | null
  shareCode?: string | null
  data?: unknown
}) {
  return exec(
    `INSERT INTO notification (user_id, kind, actor_id, share_code, data, created)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      n.userId,
      n.kind,
      n.actorId ?? null,
      n.shareCode ?? null,
      n.data === undefined ? null : JSON.stringify(n.data),
      Date.now(),
    ],
  )
}
