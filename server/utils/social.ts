// Friends and notifications. Lives in the same `app.db` as the better-auth
// tables so a friendship can foreign-key straight to `user` and disappear with
// the account it belonged to.

import type Database from 'better-sqlite3'

export type FriendStatus = 'pending' | 'accepted' | 'blocked'
export type NotificationKind = 'friend_request' | 'friend_accepted' | 'instance_invite' | 'instance_update'

/** One row per *pair*, not per direction — `requester_id` remembers who asked. */
export function ensureSocialSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendship (
      id           INTEGER PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      addressee_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'pending',
      created      INTEGER NOT NULL,
      UNIQUE(requester_id, addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendship_addressee ON friendship(addressee_id, status);
    CREATE INDEX IF NOT EXISTS idx_friendship_requester ON friendship(requester_id, status);

    CREATE TABLE IF NOT EXISTS notification (
      id         INTEGER PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      actor_id   TEXT REFERENCES user(id) ON DELETE CASCADE,
      share_code TEXT,
      data       TEXT,
      read       INTEGER NOT NULL DEFAULT 0,
      created    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, id);

    -- Who a share code was sent to, and which revision of it they installed.
    CREATE TABLE IF NOT EXISTS share_recipient (
      code              TEXT NOT NULL,
      user_id           TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      sent              INTEGER NOT NULL,
      imported_revision INTEGER,
      PRIMARY KEY (code, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_share_recipient_user ON share_recipient(user_id);
  `)
}

/** Public shape of a user — never leak e-mail or anything auth-related. */
export interface PublicUser {
  id: string
  name: string | null
  username: string | null
  image: string | null
}

const PUBLIC_COLUMNS = 'id, name, username, image'

export function findUser(db: Database.Database, query: string): PublicUser | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM user WHERE lower(username) = ? OR lower(email) = ? LIMIT 1`)
    .get(q, q) as PublicUser | undefined
}

export function getUser(db: Database.Database, id: string): PublicUser | undefined {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM user WHERE id = ?`).get(id) as PublicUser | undefined
}

/**
 * Accepted friends of `userId`, whichever side of the row they sit on. Carries
 * `friendshipId` so the UI can unfriend without a second lookup.
 */
export function friendsOf(db: Database.Database, userId: string): (PublicUser & { friendshipId: number })[] {
  return db
    .prepare(`
      SELECT u.id, u.name, u.username, u.image, f.id AS friendshipId
      FROM friendship f
      JOIN user u ON u.id = CASE WHEN f.requester_id = @me THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'accepted' AND (f.requester_id = @me OR f.addressee_id = @me)
      ORDER BY lower(coalesce(u.username, u.name))
    `)
    .all({ me: userId }) as (PublicUser & { friendshipId: number })[]
}

/** Requests waiting for `userId` to answer (`incoming`) or to be answered (`outgoing`). */
export function pendingFor(db: Database.Database, userId: string) {
  const rows = db
    .prepare(`
      SELECT f.id, f.requester_id, f.addressee_id, f.created, u.id AS u_id, u.name, u.username, u.image
      FROM friendship f
      JOIN user u ON u.id = CASE WHEN f.requester_id = @me THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'pending' AND (f.requester_id = @me OR f.addressee_id = @me)
      ORDER BY f.created DESC
    `)
    .all({ me: userId }) as any[]
  const map = (r: any) => ({
    id: r.id as number,
    created: r.created as number,
    user: { id: r.u_id, name: r.name, username: r.username, image: r.image } as PublicUser,
  })
  return {
    incoming: rows.filter(r => r.addressee_id === userId).map(map),
    outgoing: rows.filter(r => r.requester_id === userId).map(map),
  }
}

export function areFriends(db: Database.Database, a: string, b: string): boolean {
  return !!db
    .prepare(`
      SELECT 1 FROM friendship WHERE status = 'accepted'
        AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    `)
    .get(a, b, b, a)
}

export function notify(db: Database.Database, n: {
  userId: string
  kind: NotificationKind
  actorId?: string | null
  shareCode?: string | null
  data?: unknown
}) {
  db.prepare(
    `INSERT INTO notification (user_id, kind, actor_id, share_code, data, created)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(n.userId, n.kind, n.actorId ?? null, n.shareCode ?? null,
    n.data === undefined ? null : JSON.stringify(n.data), Date.now())
}
