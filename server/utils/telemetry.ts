// Anonymous telemetry for the Spectra Launcher.
//
// Same Postgres database as everything else, but no PII is ever stored — only a
// random per-install UUID, coarse environment info and event counts. See
// app/pages/admin.vue for the dashboard that reads it.

import { exec } from './db'

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
export function pruneOld() {
  return exec('DELETE FROM events WHERE day < $1', [dayKey(Date.now() - RETENTION_DAYS * 86_400_000)])
}

/** Constant-time-ish equality for the admin token. */
export function tokenOk(provided: unknown, expected: string): boolean {
  return typeof provided === 'string' && expected.length > 0 && provided === expected
}
