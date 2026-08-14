// Storage for launcher "share codes": a user exports an instance in the
// launcher, it lands here as a small `.zip` (a manifest of mod ids + configs —
// never the mod jars themselves) and anyone with the 6-character code can pull
// it back down for 7 days.
//
// Own SQLite file, separate from telemetry.db: the rows carry BLOBs and get
// deleted constantly, which is a very different access pattern.

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

let db: Database.Database | null = null

/** How long a code stays redeemable. */
export const TTL_DAYS = 7

/** Hard cap on one pack, uploaded straight to R2. */
export const MAX_PACK_BYTES = 1024 * 1024 * 1024

/**
 * Cap for the older route that sends the pack *through* this server as a
 * request body. Cloudflare proxies the site and rejects bodies over 100 MB
 * before Nitro sees them, so anything larger has to go to R2 — which is what
 * current launchers do (`/api/share/upload-url`).
 */
export const MAX_INLINE_BYTES = 100 * 1024 * 1024

/**
 * A code lasts a week. Its owner can push it out by another week from the
 * launcher once it is nearly up — see `share/[code]/extend.post.ts`.
 */
export const EXTEND_WINDOW_MS = 48 * 60 * 60 * 1000

/** Lazily opens (and migrates) the share database. */
export function useShareDb(): Database.Database {
  if (db) return db
  const path = process.env.SHARE_DB_PATH || './data/shares.db'
  mkdirSync(dirname(path), { recursive: true })

  const handle = new Database(path)
  handle.pragma('journal_mode = WAL')
  // Rows hold BLOBs and are deleted on expiry; without auto_vacuum SQLite keeps
  // the freed pages forever. It must be set before the table exists.
  handle.pragma('auto_vacuum = FULL')
  handle.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      code       TEXT PRIMARY KEY,
      created    INTEGER NOT NULL,
      expires    INTEGER NOT NULL,
      name       TEXT,
      mc_version TEXT,
      loader     TEXT,
      mods       INTEGER DEFAULT 0,
      size       INTEGER NOT NULL,
      downloads  INTEGER DEFAULT 0,
      blob       BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires);
    CREATE INDEX IF NOT EXISTS idx_shares_created ON shares(created);
  `)

  // Added when accounts arrived. Codes made before that keep `owner_id` NULL
  // and stay anonymous, link-only shares — exactly as they behaved before.
  addColumn(handle, 'owner_id', 'TEXT')
  addColumn(handle, 'instance_id', 'TEXT')
  addColumn(handle, 'revision', 'INTEGER NOT NULL DEFAULT 1')
  // Packs live in R2 now; `blob` is only still read for codes made before that.
  addColumn(handle, 'object_key', 'TEXT')
  // 0 while a presigned upload is still in flight — the code resolves only once
  // the launcher confirms the object actually landed.
  addColumn(handle, 'uploaded', 'INTEGER NOT NULL DEFAULT 1')
  // Where an in-flight upload is headed. Kept so an upload that never completes
  // leaves a deletable object behind rather than an invisible one we pay for.
  addColumn(handle, 'pending_key', 'TEXT')
  addColumn(handle, 'pending_at', 'INTEGER')
  handle.exec('CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_id, instance_id)')

  db = handle
  return db
}

/** `ALTER TABLE ... ADD COLUMN`, skipped if the column is already there. */
function addColumn(handle: Database.Database, name: string, decl: string) {
  const cols = handle.prepare('PRAGMA table_info(shares)').all() as { name: string }[]
  if (!cols.some(c => c.name === name)) {
    handle.exec(`ALTER TABLE shares ADD COLUMN ${name} ${decl}`)
  }
}

export function expiryFor(now: number): number {
  return now + TTL_DAYS * 86_400_000
}

/** How long the (blob-less) metadata row lingers for the admin dashboard. */
const HISTORY_DAYS = 90

/**
 * Frees expired codes: the R2 object is deleted, the legacy blob dropped. The
 * (now weightless) row lives on for a while so the admin dashboard keeps its
 * history. Called whenever someone uploads or extends — writes are rare enough
 * that no cron is needed, and nothing costs storage in the meantime.
 */
export async function pruneShares(handle: Database.Database): Promise<number> {
  const now = Date.now()

  const stale = handle
    .prepare('SELECT code, object_key FROM shares WHERE expires < ? AND object_key IS NOT NULL')
    .all(now) as { code: string, object_key: string }[]

  const r2 = stale.length ? useR2() : null
  let freed = 0
  for (const row of stale) {
    // Only forget the key once the object is really gone, so a failed delete is
    // retried on the next pass instead of leaking a paid-for object forever.
    if (r2 && !(await r2Delete(r2, row.object_key))) continue
    handle.prepare('UPDATE shares SET object_key = NULL WHERE code = ?').run(row.code)
    freed++
  }

  freed += handle
    .prepare('UPDATE shares SET blob = NULL WHERE expires < ? AND blob IS NOT NULL')
    .run(now).changes

  // Uploads that were handed a URL and never confirmed. Past the signature's
  // own lifetime nothing can complete them, so the object is just garbage.
  const abandoned = handle
    .prepare('SELECT code, pending_key FROM shares WHERE pending_key IS NOT NULL AND pending_at < ?')
    .all(now - UPLOAD_URL_TTL * 1000) as { code: string, pending_key: string }[]
  for (const row of abandoned) {
    const r2b = useR2()
    if (r2b && !(await r2Delete(r2b, row.pending_key))) continue
    handle.prepare('UPDATE shares SET pending_key = NULL, pending_at = NULL WHERE code = ?')
      .run(row.code)
    freed++
  }

  // `expires < now` guards the history sweep too, so a live code is never swept
  // out from under its holders just because it was created a long time ago.
  handle
    .prepare('DELETE FROM shares WHERE created < ? AND expires < ?')
    .run(now - HISTORY_DAYS * 86_400_000, now)
  return freed
}

// No 0/O/1/I — codes get read out loud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

/** A fresh, unused share code. */
export function newCode(handle: Database.Database): string {
  const exists = handle.prepare('SELECT 1 FROM shares WHERE code = ?')
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = randomBytes(CODE_LEN)
    let code = ''
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length]
    if (!exists.get(code)) return code
  }
  throw createError({ statusCode: 500, statusMessage: 'could not allocate a code' })
}

/** Normalises user input ("spectra.../s/ab-cd12" or " abcd12 ") to a code. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-CODE_LEN)
}

/**
 * Where a pack lives in the bucket. Revision-stamped, so pushing an update
 * never overwrites the copy someone is halfway through downloading.
 */
export function packKey(code: string, revision: number) {
  return `packs/${code}/${revision}.zip`
}
