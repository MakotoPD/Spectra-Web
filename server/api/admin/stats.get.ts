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
  try {
    return buildStats()
  } catch (e) {
    console.error('[telemetry] stats failed:', e)
    throw createError({ statusCode: 500, statusMessage: (e as Error)?.message || 'stats failed' })
  }
})

function buildStats() {
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
    shares: buildShareStats(now),
  }
}

/**
 * Instance sharing (server/utils/share.ts). Lives in its own SQLite file, so a
 * failure there must not take the telemetry dashboard down with it.
 */
function buildShareStats(now: number) {
  try {
    const db = useShareDb()
    const ms = (days: number) => now - days * 86_400_000

    const one = (sql: string, ...args: unknown[]) =>
      ((db.prepare(sql).get(...args) as { n: number | null })?.n ?? 0)

    // Created per day for the last 30 days (gaps filled with 0).
    const raw = db
      .prepare(
        `SELECT date(created / 1000, 'unixepoch') AS label, COUNT(*) AS value
         FROM shares WHERE created >= ? GROUP BY label ORDER BY label`,
      )
      .all(ms(29)) as Bucket[]
    const map = new Map(raw.map(r => [r.label, r.value]))
    const series: Bucket[] = []
    for (let i = 29; i >= 0; i--) {
      const d = dayKey(now - i * 86_400_000)
      series.push({ label: d, value: map.get(d) ?? 0 })
    }

    const recent = db
      .prepare(
        `SELECT code, name, mc_version, loader, mods, size, downloads, created, expires
         FROM shares ORDER BY created DESC LIMIT 15`,
      )
      .all() as Record<string, unknown>[]

    return {
      overview: {
        created30: one('SELECT COUNT(*) AS n FROM shares WHERE created >= ?', ms(29)),
        active: one('SELECT COUNT(*) AS n FROM shares WHERE expires > ?', now),
        downloads30: one('SELECT SUM(downloads) AS n FROM shares WHERE created >= ?', ms(29)),
        storedBytes: one('SELECT SUM(size) AS n FROM shares WHERE blob IS NOT NULL'),
      },
      series,
      recent,
      loaders: db
        .prepare(
          `SELECT loader AS label, COUNT(*) AS value FROM shares
           WHERE created >= ? AND loader IS NOT NULL AND loader <> ''
           GROUP BY label ORDER BY value DESC LIMIT 8`,
        )
        .all(ms(29)) as Bucket[],
    }
  } catch (e) {
    console.error('[shares] stats failed:', e)
    return null
  }
}
