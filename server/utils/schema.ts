// Every table this app owns, created on boot next to better-auth's own
// migration.
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

    -- Discord. Written by the admin panel, read by the bot process in the
    -- dc-bot repo — the two never call each other, this database is the whole
    -- interface between them. Created here rather than there because this app
    -- is the one with a schema step, and the panel writes the config before the
    -- bot has any reason to read it.
    --
    -- Prefixed, because guild_config and tickets are far too generic to sit
    -- unqualified next to shares and events.
    CREATE TABLE IF NOT EXISTS discord_config (
      guild_id                TEXT PRIMARY KEY,
      log_channel             TEXT,
      ticket_category         TEXT,
      ticket_archive_category TEXT,
      ticket_panel_channel    TEXT,
      ticket_prefix           TEXT NOT NULL DEFAULT 'ticket-',
      ticket_open_embed       JSONB NOT NULL DEFAULT '{}',
      ticket_panel_embed      JSONB NOT NULL DEFAULT '{}'
    );

    -- Roles that can see every ticket. Pinged when one opens.
    CREATE TABLE IF NOT EXISTS discord_ticket_roles (
      guild_id TEXT NOT NULL,
      role_id  TEXT NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS discord_tickets (
      id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      guild_id        TEXT NOT NULL,
      channel_id      TEXT NOT NULL UNIQUE,
      user_id         TEXT NOT NULL,
      topic           TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      -- The channel is renamed and archived on close, so the transcript is the
      -- only durable record of what was actually said.
      transcript_html TEXT,
      created         BIGINT NOT NULL,
      closed          BIGINT,
      closed_by       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_discord_tickets_open ON discord_tickets(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_discord_tickets_user ON discord_tickets(guild_id, user_id);

    CREATE TABLE IF NOT EXISTS discord_warnings (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      guild_id     TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason       TEXT,
      created      BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discord_warnings_user ON discord_warnings(guild_id, user_id);

    -- One row per guild per direction. embed_json is a Discord embed as the
    -- panel's editor produced it; the bot substitutes {username} and friends at
    -- send time rather than storing anything resolved.
    CREATE TABLE IF NOT EXISTS discord_welcome (
      guild_id     TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      enabled      BOOLEAN NOT NULL DEFAULT FALSE,
      channel_id   TEXT,
      message_type TEXT NOT NULL DEFAULT 'text',
      content      TEXT NOT NULL DEFAULT '',
      embed_json   JSONB NOT NULL DEFAULT '{}',
      PRIMARY KEY (guild_id, event_type)
    );
  `)

  // better-auth maps a `number` field to `integer`, and epoch milliseconds do
  // not fit in four bytes — the heartbeat failed with "out of range". Widened
  // here, and only when it has not been widened already, so boot does not
  // rewrite the table every time.
  const narrow = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user' AND column_name = 'lastSeen' AND data_type = 'integer'
  `)
  if (narrow.rowCount) {
    await pool.query('ALTER TABLE "user" ALTER COLUMN "lastSeen" TYPE BIGINT')
  }

  // One Minecraft profile belongs to one account. better-auth creates the
  // columns (see `additionalFields`); the uniqueness is ours to enforce, and it
  // is what stops two people claiming the same name.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_mc_uuid ON "user"("mcUuid")
    WHERE "mcUuid" IS NOT NULL
  `)

  // Two notifications for the same person, of the same kind, in the same
  // millisecond are the same notification — a double-fired insert, not two
  // events. The index is what makes that unrepresentable.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_moment
      ON notification(user_id, kind, created)
  `)
}
