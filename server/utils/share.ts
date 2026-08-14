// Share codes: a launcher packs an instance, the pack goes to R2 and this is
// the bookkeeping that turns it into a six-character code for a week.
//
// The pack itself is never here — only its object key. See `share/upload-url`
// for why it goes straight to storage.

import { q, exec } from './db'
import { useR2, r2Delete, UPLOAD_URL_TTL } from './r2'

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

export function expiryFor(now: number): number {
  return now + TTL_DAYS * 86_400_000
}

/** How long the (packless) metadata row lingers for the admin dashboard. */
const HISTORY_DAYS = 90

/**
 * Frees expired codes: the R2 object is deleted and the row kept a while so the
 * dashboard has history. Called whenever someone uploads or extends — writes
 * are rare enough that no cron is needed, and nothing costs storage meanwhile.
 */
export async function pruneShares(): Promise<number> {
  const now = Date.now()
  const r2 = useR2()
  let freed = 0

  const stale = await q<{ code: string, object_key: string }>(
    'SELECT code, object_key FROM shares WHERE expires < $1 AND object_key IS NOT NULL',
    [now],
  )
  for (const row of stale) {
    // Only forget the key once the object is really gone, so a failed delete is
    // retried on the next pass instead of leaking a paid-for object forever.
    if (r2 && !(await r2Delete(r2, row.object_key))) continue
    await exec('UPDATE shares SET object_key = NULL WHERE code = $1', [row.code])
    freed++
  }

  // Uploads that were handed a URL and never confirmed. Past the signature's
  // own lifetime nothing can complete them, so the object is just garbage.
  const abandoned = await q<{ code: string, pending_key: string }>(
    'SELECT code, pending_key FROM shares WHERE pending_key IS NOT NULL AND pending_at < $1',
    [now - UPLOAD_URL_TTL * 1000],
  )
  for (const row of abandoned) {
    if (r2 && !(await r2Delete(r2, row.pending_key))) continue
    await exec('UPDATE shares SET pending_key = NULL, pending_at = NULL WHERE code = $1', [row.code])
    freed++
  }

  // `expires < now` guards the history sweep too, so a live code is never swept
  // out from under its holders just because it was created a long time ago.
  await exec('DELETE FROM shares WHERE created < $1 AND expires < $2',
    [now - HISTORY_DAYS * 86_400_000, now])
  return freed
}

// No 0/O/1/I — codes get read out loud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

/** A fresh, unused share code. */
export async function newCode(): Promise<string> {
  const { randomBytes } = await import('node:crypto')
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = randomBytes(CODE_LEN)
    let code = ''
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length]
    const taken = await q('SELECT 1 FROM shares WHERE code = $1', [code])
    if (!taken.length) return code
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
