// Minting a username for an account that arrived without one.
//
// Every OAuth provider hands better-auth the same five fields — id, name,
// email, emailVerified, image — and `username` is not among them, so a social
// signup lands with the column empty. That is not cosmetic: an account with no
// username has no `/u/` profile, its links render as `/u/null`, and the friend
// search (which matches on username and mcUsername) cannot see it at all.
//
// The slug rules live in `username-slug.ts`; this file is the half that needs a
// database to decide what is still free.

import { exec, one, q } from './db'
import { usernameBase, withSuffix } from './username-slug'

/**
 * A free username derived from `preferred`, e.g. `michal_nowak`, then
 * `michal_nowak2`, `michal_nowak3` …
 *
 * ponytail: two signups racing on the same base can both read it as free, and
 * the second insert then trips the unique index and fails the signup. Rare
 * enough to leave alone; if it ever shows up in the logs, the fix is a retry
 * around the insert rather than a lock here.
 */
export async function uniqueUsername(preferred: string): Promise<string> {
  const base = usernameBase(preferred)

  // One round-trip instead of one per collision: ask which of the first twenty
  // candidates are spoken for, and take the lowest that is not.
  const candidates = [base, ...Array.from({ length: 20 }, (_, i) => withSuffix(base, String(i + 2)))]
  const taken = new Set(
    (await q<{ username: string }>('SELECT username FROM "user" WHERE username = ANY($1)', [candidates]))
      .map(r => r.username),
  )
  const free = candidates.find(c => !taken.has(c))
  if (free) return free

  // Twenty people already share this name. Stop counting and start guessing.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = withSuffix(base, Math.random().toString(36).slice(2, 8))
    if (!await one('SELECT 1 FROM "user" WHERE username = $1', [candidate])) return candidate
  }
  throw new Error(`could not find a free username for "${base}"`)
}

/**
 * Gives a username to every account that has none — the ones created through a
 * provider before this was wired up.
 *
 * Runs at boot and returns how many it fixed. It stays rather than being a
 * one-shot script because it is also the safety net: any account that somehow
 * lands without a username is repaired on the next restart instead of silently
 * being invisible to search.
 */
export async function backfillUsernames(): Promise<number> {
  const rows = await q<{ id: string, name: string | null, email: string }>(
    'SELECT id, name, email FROM "user" WHERE username IS NULL',
  )

  // One at a time, not in parallel: each UPDATE has to be visible to the next
  // uniqueUsername() call, or two accounts named "Steve" both get `steve`.
  for (const row of rows) {
    const username = await uniqueUsername(row.name || row.email.split('@')[0] || 'player')
    await exec(
      'UPDATE "user" SET username = $1, "displayUsername" = COALESCE("displayUsername", $1) WHERE id = $2',
      [username, row.id],
    )
  }
  return rows.length
}
