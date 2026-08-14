// One Postgres pool for the whole server: accounts, friends, notifications,
// share codes and telemetry all live in the same database now.
//
// `pg` is async where `better-sqlite3` was synchronous, so every query here
// returns a promise — that is the whole reason the endpoints gained `await`.

import pg from 'pg'

let pool: pg.Pool | null = null

export function usePool(): pg.Pool {
  if (pool) return pool
  // Parked on globalThis as well: dev reloads this module on every edit, and a
  // fresh pool per reload would leak connections until the server refused more.
  const cache = globalThis as typeof globalThis & { __spectraPool?: pg.Pool }
  if (cache.__spectraPool) {
    pool = cache.__spectraPool
    return pool
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw createError({ statusCode: 500, statusMessage: 'DATABASE_URL is not set' })
  }

  const created = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  // A pool error (server restart, network blip) must not take the process down.
  created.on('error', e => console.error('[db] idle client error', e))

  pool = created
  cache.__spectraPool = created
  return pool
}

/** Rows for a query. Params are `$1, $2, …` — never string-interpolated. */
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await usePool().query(sql, params)
  return res.rows as T[]
}

/** The first row, or undefined. */
export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await q<T>(sql, params)
  return rows[0]
}

/** How many rows a write touched. */
export async function exec(sql: string, params: unknown[] = []): Promise<number> {
  const res = await usePool().query(sql, params)
  return res.rowCount ?? 0
}
