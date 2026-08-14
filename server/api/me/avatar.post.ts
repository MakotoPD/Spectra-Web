// Avatar upload → Cloudflare R2.
//
// The browser already downscales the picture to a 256px WebP before it gets
// here (see `account.vue`), so this only has to check what arrived and put it
// in the bucket. R2 speaks S3, and `aws4fetch` signs a plain `fetch` — no need
// to pull in the AWS SDK for one PUT.
//
// The object key is fixed per user, so re-uploading replaces the old picture
// instead of leaving orphans behind; a `?v=` stamp on the stored URL busts any
// cache that already has the previous one.

import { r2Put } from '../../utils/r2'

const MAX_BYTES = 2 * 1024 * 1024
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)

  const r2 = useR2()
  if (!r2) throw createError({ statusCode: 501, statusMessage: 'avatar uploads are not configured' })

  const contentType = String(getHeader(event, 'content-type') || '').split(';')[0]!.trim()
  const ext = EXTENSIONS[contentType]
  if (!ext) throw createError({ statusCode: 415, statusMessage: 'png, jpeg or webp only' })

  const body = await readRawBody(event, false)
  if (!body?.length) throw createError({ statusCode: 400, statusMessage: 'empty body' })
  if (body.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'image too large' })

  const key = `avatars/${me.id}.${ext}`
  try {
    await r2Put(r2, key, body, contentType)
  } catch (e) {
    console.error('[avatar]', e)
    throw createError({ statusCode: 502, statusMessage: 'could not store the image' })
  }

  const url = `${r2.publicUrl}/${key}?v=${Date.now()}`
  useAppDb().prepare('UPDATE user SET image = ? WHERE id = ?').run(url, me.id)
  return { url }
})
