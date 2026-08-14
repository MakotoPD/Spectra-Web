// Every table this app owns, created on boot next to better-auth's own
// migration. Postgres, so identity columns and `bigint` timestamps rather than
// SQLite's `INTEGER PRIMARY KEY` and duck typing.
//
// Timestamps stay epoch-milliseconds `bigint` instead of `timestamptz`: they
// cross the wire to a Rust launcher and a browser, both of which speak epoch
// ms, and converting in three places invites the bug where one of them is off
// by a timezone.

import { usePool } from './db'

export async function ensureSchema() {
  const pool = usePool()
  await pool.query(`
    -- Share codes. The pack itself lives in R2; only its key is here.
    CREATE TABLE IF NOT EXISTS shares (
      code        TEXT PRIMARY KEY,
      created     BIGINT NOT NULL,
      expires     BIGINT NOT NULL,
      name        TEXT,
      mc_version  TEXT,
      loader      TEXT,
      mods        INTEGER NOT NULL DEFAULT 0,
      size        BIGINT NOT NULL DEFAULT 0,
      downloads   INTEGER NOT NULL DEFAULT 0,
      owner_id    TEXT,
      instance_id TEXT,
      revision    INTEGER NOT NULL DEFAULT 1,
      object_key  TEXT,
      uploaded    BOOLEAN NOT NULL DEFAULT TRUE,
      pending_key TEXT,
      pending_at  BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires);
    CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_id, instance_id);

    -- One row per pair, not per direction: requester_id remembers who asked.
    CREATE TABLE IF NOT EXISTS friendship (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      addressee_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'pending',
      created      BIGINT NOT NULL,
      UNIQUE (requester_id, addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendship_addressee ON friendship(addressee_id, status);
    CREATE INDEX IF NOT EXISTS idx_friendship_requester ON friendship(requester_id, status);

    CREATE TABLE IF NOT EXISTS notification (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      actor_id   TEXT REFERENCES "user"(id) ON DELETE CASCADE,
      share_code TEXT,
      data       JSONB,
      read       BOOLEAN NOT NULL DEFAULT FALSE,
      created    BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, id);

    -- Who a code was sent to, and which revision they installed.
    CREATE TABLE IF NOT EXISTS share_recipient (
      code              TEXT NOT NULL,
      user_id           TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      sent              BIGINT NOT NULL,
      imported_revision INTEGER,
      PRIMARY KEY (code, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_share_recipient_user ON share_recipient(user_id);

    -- Anonymous telemetry. No PII: a random per-install id and coarse counts.
    CREATE TABLE IF NOT EXISTS events (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ts         BIGINT NOT NULL,
      day        TEXT   NOT NULL,
      install_id TEXT   NOT NULL,
      event      TEXT   NOT NULL,
      version    TEXT,
      os         TEXT,
      arch       TEXT,
      locale     TEXT,
      props      JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_events_day     ON events(day);
    CREATE INDEX IF NOT EXISTS idx_events_event   ON events(event);
    CREATE INDEX IF NOT EXISTS idx_events_install ON events(install_id);
  `)

  // One Minecraft profile belongs to one account. better-auth creates the
  // columns (see `additionalFields`); the uniqueness is ours to enforce, and it
  // is what stops two people claiming the same name.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_mc_uuid ON "user"("mcUuid")
    WHERE "mcUuid" IS NOT NULL
  `)

  // A notification has no natural id of its own, so re-importing the old SQLite
  // file used to duplicate every row. Two notifications for the same person, of
  // the same kind, in the same millisecond are the same notification — this is
  // what lets the import say ON CONFLICT DO NOTHING and mean it.
  await pool.query(`
    DELETE FROM notification a
    USING notification b
    WHERE a.id > b.id
      AND a.user_id = b.user_id AND a.kind = b.kind AND a.created = b.created
      AND a.actor_id IS NOT DISTINCT FROM b.actor_id
      AND a.share_code IS NOT DISTINCT FROM b.share_code
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_moment
      ON notification(user_id, kind, created)
  `)
}
