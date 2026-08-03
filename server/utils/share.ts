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

/** Hard cap on one uploaded pack. Manifests are tiny; this only stops abuse. */
export const MAX_PACK_BYTES = 25 * 1024 * 1024

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
  db = handle
  return db
}

export function expiryFor(now: number): number {
  return now + TTL_DAYS * 86_400_000
}

/** How long the (blob-less) metadata row lingers for the admin dashboard. */
const HISTORY_DAYS = 90

/**
 * Frees expired codes. The heavy part — the blob — is dropped on expiry, but the
 * row itself lives on for a while so the admin dashboard has history to chart.
 * Called on upload; writes are rare, so no cron is needed.
 */
export function pruneShares(handle: Database.Database): number {
  const now = Date.now()
  const freed = handle
    .prepare('UPDATE shares SET blob = NULL WHERE expires < ? AND blob IS NOT NULL')
    .run(now).changes
  handle.prepare('DELETE FROM shares WHERE created < ?').run(now - HISTORY_DAYS * 86_400_000)
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
