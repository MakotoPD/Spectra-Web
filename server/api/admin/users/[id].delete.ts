// Deletes an account for good, from the admin panel.
//
// Most of it is one DELETE: sessions, OAuth links, friendships, notifications
// and share-recipient rows all foreign-key to `user` with ON DELETE CASCADE.
// The two things that do not clean themselves up are the bytes in R2 and the
// `shares` rows, which carry `owner_id` as a plain column with no constraint —
// those would otherwise outlive the account and keep costing storage.

import { r2Delete } from '../../../utils/r2'

const AVATAR_EXTENSIONS = ['webp', 'png', 'jpg']

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })

  const user = await one<{ id: string }>('SELECT id FROM "user" WHERE id = $1', [id])
  if (!user) throw createError({ statusCode: 404, statusMessage: 'no such user' })

  const r2 = useR2()
  if (r2) {
    const packs = await q<{ object_key: string | null, pending_key: string | null }>(
      'SELECT object_key, pending_key FROM shares WHERE owner_id = $1', [id])
    const keys = [
      ...packs.flatMap(p => [p.object_key, p.pending_key]),
      // The avatar key is derived, not stored — `image` holds a public URL with
      // a cache-busting stamp on it, which is not something to parse a key out
      // of. Only one extension exists for any given account; the other two are
      // misses, and a miss costs one request.
      ...AVATAR_EXTENSIONS.map(ext => `avatars/${id}.${ext}`),
    ].filter((k): k is string => !!k)

    for (const key of keys) {
      // A failed delete must not abort the account removal — the row going away
      // is the part that matters, and an orphaned object can be swept later.
      await r2Delete(r2, key).catch(e => console.error('[admin] r2 delete', key, e))
    }
  }

  await exec('DELETE FROM shares WHERE owner_id = $1', [id])
  await exec('DELETE FROM "user" WHERE id = $1', [id])

  return { ok: true }
})
