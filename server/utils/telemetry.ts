// Anonymous telemetry storage for the Spectra Launcher.
//
// One local SQLite file (better-sqlite3, already a dependency). No PII is ever
// stored — only a random per-install UUID, coarse environment info and event
// counts. See app/pages/admin.vue for the dashboard that reads it.

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

/** Lazily opens (and migrates) the telemetry database. */
export function useTelemetryDb(): Database.Database {
  if (db) return db
  const path = process.env.TELEMETRY_DB_PATH || './data/telemetry.db'
  mkdirSync(dirname(path), { recursive: true })

  const handle = new Database(path)
  handle.pragma('journal_mode = WAL')
  handle.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY,
      ts         INTEGER NOT NULL,
      day        TEXT    NOT NULL,
      install_id TEXT    NOT NULL,
      event      TEXT    NOT NULL,
      version    TEXT,
      os         TEXT,
      arch       TEXT,
      locale     TEXT,
      props      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_day     ON events(day);
    CREATE INDEX IF NOT EXISTS idx_events_event   ON events(event);
    CREATE INDEX IF NOT EXISTS idx_events_install ON events(install_id);
  `)
  db = handle
  return db
}

/** Events the ingest endpoint accepts. Anything else is dropped. */
export const ALLOWED_EVENTS = new Set([
  'app_start',
  'launch',
  'feature',
  'update',
  'crash',
])

const RETENTION_DAYS = 90

/** `YYYY-MM-DD` in UTC for a given epoch-ms timestamp. */
export function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Trims a value to a short, safe string (or undefined). */
export function clampStr(v: unknown, max = 64): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s ? s.slice(0, max) : undefined
}

/** Deletes events older than the retention window. Cheap; called occasionally. */
export function pruneOld(handle: Database.Database) {
  const cutoff = dayKey(Date.now() - RETENTION_DAYS * 86_400_000)
  handle.prepare('DELETE FROM events WHERE day < ?').run(cutoff)
}

/** Constant-time-ish equality for the admin token. */
export function tokenOk(provided: unknown, expected: string): boolean {
  return typeof provided === 'string' && expected.length > 0 && provided === expected
}
