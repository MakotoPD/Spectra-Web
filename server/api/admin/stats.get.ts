// Aggregated telemetry for the admin dashboard. Cookie-gated (see login.post.ts).
// Everything is computed on the fly with plain SQL — small data, Postgres is fast.

interface Bucket { label: string, value: number }

function requireAdmin(event: import('h3').H3Event) {
  const cfg = useRuntimeConfig()
  if (!tokenOk(getCookie(event, 'spectra_admin'), cfg.adminToken)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
}

/** Distinct installs grouped by a column/expression, top N. */
function distinctInstallsBy(expr: string, since: string, limit = 8) {
  return q<Bucket>(
    `SELECT ${expr} AS label, COUNT(DISTINCT install_id)::int AS value
     FROM events WHERE day >= $1 AND ${expr} IS NOT NULL AND ${expr} <> ''
     GROUP BY 1 ORDER BY value DESC LIMIT $2`,
    [since, limit],
  )
}

/** Event count grouped by a props expression, top N. */
function countBy(eventName: string, expr: string, since: string, limit = 8) {
  return q<Bucket>(
    `SELECT ${expr} AS label, COUNT(*)::int AS value
     FROM events WHERE event = $1 AND day >= $2 AND ${expr} IS NOT NULL AND ${expr} <> ''
     GROUP BY 1 ORDER BY value DESC LIMIT $3`,
    [eventName, since, limit],
  )
}

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  try {
    return await buildStats()
  } catch (e) {
    console.error('[telemetry] stats failed:', e)
    throw createError({ statusCode: 500, statusMessage: (e as Error)?.message || 'stats failed' })
  }
})

async function buildStats() {
  const now = Date.now()
  const today = dayKey(now)
  const since = (days: number) => dayKey(now - days * 86_400_000)
  const d30 = since(29)

  const count = async (sql: string, params: unknown[] = []) =>
    (await one<{ n: number }>(sql, params))?.n ?? 0

  const overview = {
    totalInstalls: await count('SELECT COUNT(DISTINCT install_id)::int AS n FROM events'),
    dau: await count('SELECT COUNT(DISTINCT install_id)::int AS n FROM events WHERE day = $1', [today]),
    wau: await count('SELECT COUNT(DISTINCT install_id)::int AS n FROM events WHERE day >= $1', [since(6)]),
    mau: await count('SELECT COUNT(DISTINCT install_id)::int AS n FROM events WHERE day >= $1', [d30]),
    launches30: await count("SELECT COUNT(*)::int AS n FROM events WHERE event = 'launch' AND day >= $1", [d30]),
    crashes30: await count("SELECT COUNT(*)::int AS n FROM events WHERE event = 'crash' AND day >= $1", [d30]),
  }

  // Daily active installs over the last 30 days (fill gaps with 0).
  const rawActive = await q<Bucket>(
    `SELECT day AS label, COUNT(DISTINCT install_id)::int AS value
     FROM events WHERE day >= $1 GROUP BY day ORDER BY day`,
    [d30],
  )
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
    versions: await distinctInstallsBy('version', d30),
    os: await distinctInstallsBy('os', d30),
    locales: await distinctInstallsBy('locale', d30),
    loaders: await countBy('launch', "props->>'loader'", d30),
    mcVersions: await countBy('launch', "props->>'mc'", d30),
    features: await countBy('feature', "props->>'name'", d30, 12),
    shares: await buildShareStats(now),
  }
}

/**
 * Instance sharing (server/utils/share.ts). A failure here must not take the
 * telemetry dashboard down with it.
 */
async function buildShareStats(now: number) {
  try {
    const ms = (days: number) => now - days * 86_400_000
    const count = async (sql: string, params: unknown[] = []) =>
      Number((await one<{ n: number | null }>(sql, params))?.n ?? 0)

    // Created per day for the last 30 days (gaps filled with 0).
    const raw = await q<Bucket>(
      `SELECT to_char(to_timestamp(created / 1000) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS label,
              COUNT(*)::int AS value
       FROM shares WHERE created >= $1 GROUP BY 1 ORDER BY 1`,
      [ms(29)],
    )
    const map = new Map(raw.map(r => [r.label, r.value]))
    const series: Bucket[] = []
    for (let i = 29; i >= 0; i--) {
      const d = dayKey(now - i * 86_400_000)
      series.push({ label: d, value: map.get(d) ?? 0 })
    }

    const recent = await q<Record<string, unknown>>(
      `SELECT code, name, mc_version, loader, mods, size, downloads, created, expires
       FROM shares ORDER BY created DESC LIMIT 15`,
    )

    return {
      overview: {
        created30: await count('SELECT COUNT(*)::int AS n FROM shares WHERE created >= $1', [ms(29)]),
        active: await count('SELECT COUNT(*)::int AS n FROM shares WHERE expires > $1', [now]),
        downloads30: await count('SELECT COALESCE(SUM(downloads), 0)::int AS n FROM shares WHERE created >= $1', [ms(29)]),
        // What the bucket is actually holding right now.
        storedBytes: await count('SELECT COALESCE(SUM(size), 0)::bigint AS n FROM shares WHERE object_key IS NOT NULL'),
      },
      series,
      recent,
      loaders: await q<Bucket>(
        `SELECT loader AS label, COUNT(*)::int AS value
         FROM shares WHERE loader IS NOT NULL AND loader <> '' AND created >= $1
         GROUP BY 1 ORDER BY value DESC LIMIT 8`,
        [ms(29)],
      ),
    }
  } catch (e) {
    console.error('[shares] stats failed:', e)
    return null
  }
}
