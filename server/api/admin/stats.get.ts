// Aggregated telemetry for the admin dashboard. Cookie-gated (see login.post.ts).
// Everything is computed on the fly with plain SQL — small data, SQLite is fast.

import type { Database } from 'better-sqlite3'

interface Bucket { label: string; value: number }

function requireAdmin(event: import('h3').H3Event) {
  const cfg = useRuntimeConfig()
  if (!tokenOk(getCookie(event, 'spectra_admin'), cfg.adminToken)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
}

/** Distinct installs grouped by a column/expression, top N. */
function distinctInstallsBy(db: Database, expr: string, since: string, limit = 8): Bucket[] {
  const rows = db
    .prepare(
      `SELECT ${expr} AS label, COUNT(DISTINCT install_id) AS value
       FROM events WHERE day >= ? AND label IS NOT NULL AND label <> ''
       GROUP BY label ORDER BY value DESC LIMIT ?`,
    )
    .all(since, limit) as Bucket[]
  return rows
}

/** Event count grouped by a props expression, top N. */
function countBy(db: Database, eventName: string, expr: string, since: string, limit = 8): Bucket[] {
  const rows = db
    .prepare(
      `SELECT ${expr} AS label, COUNT(*) AS value
       FROM events WHERE event = ? AND day >= ? AND label IS NOT NULL AND label <> ''
       GROUP BY label ORDER BY value DESC LIMIT ?`,
    )
    .all(eventName, since, limit) as Bucket[]
  return rows
}

export default defineEventHandler((event) => {
  requireAdmin(event)
  const db = useTelemetryDb()

  const now = Date.now()
  const today = dayKey(now)
  const since = (days: number) => dayKey(now - days * 86_400_000)
  const d30 = since(29)

  const distinct = (sql: string, ...args: unknown[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n

  const overview = {
    totalInstalls: distinct('SELECT COUNT(DISTINCT install_id) AS n FROM events'),
    dau: distinct('SELECT COUNT(DISTINCT install_id) AS n FROM events WHERE day = ?', today),
    wau: distinct('SELECT COUNT(DISTINCT install_id) AS n FROM events WHERE day >= ?', since(6)),
    mau: distinct('SELECT COUNT(DISTINCT install_id) AS n FROM events WHERE day >= ?', d30),
    launches30: distinct("SELECT COUNT(*) AS n FROM events WHERE event = 'launch' AND day >= ?", d30),
    crashes30: distinct("SELECT COUNT(*) AS n FROM events WHERE event = 'crash' AND day >= ?", d30),
  }

  // Daily active installs over the last 30 days (fill gaps with 0).
  const rawActive = db
    .prepare(
      `SELECT day AS label, COUNT(DISTINCT install_id) AS value
       FROM events WHERE day >= ? GROUP BY day ORDER BY day`,
    )
    .all(d30) as Bucket[]
  const activeMap = new Map(rawActive.map(r => [r.label, r.value]))
  const activeSeries: Bucket[] = []
  for (let i = 29; i >= 0; i--) {
    const d = since(i)
    activeSeries.push({ label: d, value: activeMap.get(d) ?? 0 })
  }

  return {
    generatedAt: now,
    overview,
    activeSeries,
    versions: distinctInstallsBy(db, 'version', d30),
    os: distinctInstallsBy(db, 'os', d30),
    locales: distinctInstallsBy(db, 'locale', d30),
    loaders: countBy(db, 'launch', "json_extract(props, '$.loader')", d30),
    mcVersions: countBy(db, 'launch', "json_extract(props, '$.mc')", d30),
    features: countBy(db, 'feature', "json_extract(props, '$.name')", d30, 12),
  }
})
