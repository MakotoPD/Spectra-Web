// Brings the old SQLite files across on boot, then never does anything again.
//
// It runs inside the server rather than from a shell script in the entrypoint,
// for two reasons that both bite immediately otherwise: the tables have to
// exist first (better-auth migrates them a few lines earlier), and Nitro
// bundles `pg` into its own chunks — a separate process would have no driver to
// import unless the image installed a second copy.
//
// Mount the old data volume at LEGACY_SQLITE_DIR for the first deploy. Once the
// rows are across, unmount it and this is a single `existsSync` per boot.
//
// Re-running is safe: every insert is ON CONFLICT DO NOTHING.

import fs from 'node:fs'
import path from 'node:path'
import { usePool } from './db'

const bool = (v: unknown) => v === 1 || v === true || v === 'true'
const json = (v: unknown) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v))
const date = (v: unknown) => (v == null ? null : new Date(typeof v === 'number' ? v : String(v)))

interface Table {
  from: string
  sql: string
  row: (r: any) => unknown[]
}

const PLAN: { file: string, tables: Table[] }[] = [
  {
    file: 'app.db',
    tables: [
      {
        from: 'user',
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt",
                                  username, "displayUsername", "twoFactorEnabled")
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
        row: r => [r.id, r.name, r.email, bool(r.emailVerified), r.image,
          date(r.createdAt), date(r.updatedAt), r.username, r.displayUsername,
          bool(r.twoFactorEnabled)],
      },
      {
        from: 'account',
        sql: `INSERT INTO account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken",
                                   "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope,
                                   password, "createdAt", "updatedAt")
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
        row: r => [r.id, r.accountId, r.providerId, r.userId, r.accessToken, r.refreshToken,
          r.idToken, date(r.accessTokenExpiresAt), date(r.refreshTokenExpiresAt),
          r.scope, r.password, date(r.createdAt), date(r.updatedAt)],
      },
      {
        from: 'twoFactor',
        sql: `INSERT INTO "twoFactor" (id, secret, "backupCodes", "userId")
              VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        row: r => [r.id, r.secret, r.backupCodes, r.userId],
      },
      {
        from: 'friendship',
        // The identity column assigns its own id; the pair is what must be unique.
        sql: `INSERT INTO friendship (requester_id, addressee_id, status, created)
              VALUES ($1,$2,$3,$4) ON CONFLICT (requester_id, addressee_id) DO NOTHING`,
        row: r => [r.requester_id, r.addressee_id, r.status, r.created],
      },
      {
        from: 'notification',
        sql: `INSERT INTO notification (user_id, kind, actor_id, share_code, data, read, created)
              VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, kind, created) DO NOTHING`,
        row: r => [r.user_id, r.kind, r.actor_id, r.share_code, json(r.data), bool(r.read), r.created],
      },
      {
        from: 'share_recipient',
        sql: `INSERT INTO share_recipient (code, user_id, sent, imported_revision)
              VALUES ($1,$2,$3,$4) ON CONFLICT (code, user_id) DO NOTHING`,
        row: r => [r.code, r.user_id, r.sent, r.imported_revision],
      },
    ],
  },
  {
    file: 'shares.db',
    tables: [
      {
        from: 'shares',
        // `blob` is deliberately dropped: packs live in R2 now, and a code whose
        // bytes were only ever in SQLite cannot be served any more anyway.
        sql: `INSERT INTO shares (code, created, expires, name, mc_version, loader, mods, size,
                                  downloads, owner_id, instance_id, revision, object_key, uploaded)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (code) DO NOTHING`,
        row: r => [r.code, r.created, r.expires, r.name, r.mc_version, r.loader, r.mods ?? 0,
          r.size ?? 0, r.downloads ?? 0, r.owner_id ?? null, r.instance_id ?? null,
          r.revision ?? 1, r.object_key ?? null, r.object_key ? bool(r.uploaded ?? 1) : false],
      },
    ],
  },
  {
    file: 'telemetry.db',
    tables: [
      {
        from: 'events',
        // Telemetry rows have no key either; the timestamp plus the install is
        // as close as it gets, and re-importing must not double the counts.
        sql: `INSERT INTO events (ts, day, install_id, event, version, os, arch, locale, props)
              SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb
              WHERE NOT EXISTS (
                SELECT 1 FROM events WHERE ts = $1 AND install_id = $3 AND event = $4
              )`,
        row: r => [r.ts, r.day, r.install_id, r.event, r.version, r.os, r.arch, r.locale, json(r.props)],
      },
    ],
  },
]

export async function importLegacySqlite() {
  const dir = process.env.LEGACY_SQLITE_DIR || './data'
  const present = PLAN.filter(s => fs.existsSync(path.join(dir, s.file)))
  if (!present.length) return

  // Node's own SQLite reader, so the image needs no native addon just to read a
  // file it will never touch again.
  const { DatabaseSync } = await import('node:sqlite')
  const pool = usePool()
  let total = 0

  for (const source of present) {
    const db = new DatabaseSync(path.join(dir, source.file), { readOnly: true })
    for (const table of source.tables) {
      let rows: any[] = []
      try {
        rows = db.prepare(`SELECT * FROM "${table.from}"`).all()
      } catch {
        continue // that table never existed in this file
      }
      let copied = 0
      for (const r of rows) {
        try {
          const res = await pool.query(table.sql, table.row(r))
          copied += res.rowCount ?? 0
        } catch (e) {
          console.error(`[migrate] ${table.from}: row failed —`, (e as Error).message)
        }
      }
      if (copied) console.log(`[migrate] ${table.from}: ${copied}/${rows.length} rows`)
      total += copied
    }
    db.close()
  }

  console.log(total
    ? `[migrate] ${total} rows moved out of SQLite — the volume can be unmounted`
    : '[migrate] SQLite files found, nothing new to copy')
}
