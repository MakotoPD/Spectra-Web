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

import { AwsClient } from 'aws4fetch'

const MAX_BYTES = 2 * 1024 * 1024
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw createError({ statusCode: 501, statusMessage: 'avatar uploads are not configured' })
  }

  const contentType = String(getHeader(event, 'content-type') || '').split(';')[0]!.trim()
  const ext = EXTENSIONS[contentType]
  if (!ext) throw createError({ statusCode: 415, statusMessage: 'png, jpeg or webp only' })

  const body = await readRawBody(event, false)
  if (!body?.length) throw createError({ statusCode: 400, statusMessage: 'empty body' })
  if (body.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'image too large' })

  const key = `avatars/${me.id}.${ext}`
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  const res = await client.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
  })
  if (!res.ok) {
    console.error('[avatar] R2 rejected the upload', res.status, await res.text())
    throw createError({ statusCode: 502, statusMessage: 'could not store the image' })
  }

  const url = `${publicUrl}/${key}?v=${Date.now()}`
  useAppDb().prepare('UPDATE user SET image = ? WHERE id = ?').run(url, me.id)
  return { url }
})
