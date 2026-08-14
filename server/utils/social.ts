// Friends and notifications, in the same Postgres database as the accounts they
// point at — so a friendship can foreign-key straight to `user` and disappear
// with the account it belonged to.
//
// Everything is quoted (`"user"`, `"emailVerified"`): `user` is a reserved word
// in Postgres, and better-auth creates its columns in camelCase.

import { exec, one, q } from './db'

export type FriendStatus = 'pending' | 'accepted' | 'blocked'
export type NotificationKind = 'friend_request' | 'friend_accepted' | 'instance_invite' | 'instance_update'

/** Public shape of a user — never leak e-mail or anything auth-related. */
export interface PublicUser {
  id: string
  name: string | null
  username: string | null
  image: string | null
}

const PUBLIC_COLUMNS = 'id, name, username, image'

export function findUser(query: string) {
  const q1 = query.trim().toLowerCase()
  if (!q1) return Promise.resolve(undefined)
  return one<PublicUser>(
    `SELECT ${PUBLIC_COLUMNS} FROM "user" WHERE lower(username) = $1 OR lower(email) = $1 LIMIT 1`,
    [q1],
  )
}

export function getUser(id: string) {
  return one<PublicUser>(`SELECT ${PUBLIC_COLUMNS} FROM "user" WHERE id = $1`, [id])
}

/**
 * Accepted friends of `userId`, whichever side of the row they sit on. Carries
 * `friendshipId` so the UI can unfriend without a second lookup.
 */
export function friendsOf(userId: string) {
  return q<PublicUser & { friendshipId: number }>(
    `SELECT u.id, u.name, u.username, u.image, f.id AS "friendshipId"
     FROM friendship f
     JOIN "user" u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY lower(coalesce(u.username, u.name))`,
    [userId],
  )
}

/** Requests waiting for `userId` to answer (`incoming`) or to be answered. */
export async function pendingFor(userId: string) {
  const rows = await q<any>(
    `SELECT f.id, f.requester_id, f.addressee_id, f.created,
            u.id AS u_id, u.name, u.username, u.image
     FROM friendship f
     JOIN "user" u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'pending' AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY f.created DESC`,
    [userId],
  )
  const map = (r: any) => ({
    id: Number(r.id),
    created: Number(r.created),
    user: { id: r.u_id, name: r.name, username: r.username, image: r.image } as PublicUser,
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
