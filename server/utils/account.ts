// Removing an account and everything that does not clean itself up.
//
// Most of it is one DELETE: sessions, OAuth links, friendships, notifications
// and share-recipient rows all foreign-key to `user` with ON DELETE CASCADE.
// The two things that outlive the row are the bytes in R2 and the `shares`
// records, which carry `owner_id` as a plain column with no constraint — so
// both are dealt with here, in one place, rather than in each caller.

import { exec, q } from './db'
import { r2Delete, useR2 } from './r2'

// The avatar key is derived, not stored: `user.image` holds a public URL with a
// cache-busting stamp on it, which is not something to parse a key back out of.
// Only one of these exists for any account; the other two are misses, and a
// miss costs one request.
const AVATAR_EXTENSIONS = ['webp', 'png', 'jpg']

/**
 * Deletes one account for good. Safe to call for an id that is already gone.
 *
 * Storage errors are logged and swallowed: the row disappearing is the part
 * that matters, and an orphaned object can be swept later, whereas a half-done
 * delete that threw leaves the account still standing.
 */
export async function deleteAccount(id: string): Promise<void> {
  const r2 = useR2()
  if (r2) {
    const packs = await q<{ object_key: string | null, pending_key: string | null }>(
      'SELECT object_key, pending_key FROM shares WHERE owner_id = $1', [id])

    const keys = [
      ...packs.flatMap(p => [p.object_key, p.pending_key]),
      ...AVATAR_EXTENSIONS.map(ext => `avatars/${id}.${ext}`),
    ].filter((k): k is string => !!k)

    for (const key of keys) {
      await r2Delete(r2, key).catch(e => console.error('[account] r2 delete', key, e))
    }
  }

  await exec('DELETE FROM shares WHERE owner_id = $1', [id])
  await exec('DELETE FROM "user" WHERE id = $1', [id])
}
