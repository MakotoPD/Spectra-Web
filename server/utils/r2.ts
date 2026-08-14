// Cloudflare R2, shared by avatar uploads and share packs.
//
// R2 speaks S3, and `aws4fetch` signs a plain `fetch` — no AWS SDK for what is
// a handful of requests. Packs go *straight from the launcher to the bucket*
// with a presigned PUT: the site is proxied by Cloudflare, which rejects
// request bodies over 100 MB, and object storage has no such limit.

import { AwsClient } from 'aws4fetch'

export interface R2Config {
  accountId: string
  bucket: string
  publicUrl: string
  client: AwsClient
}

/** The configured bucket, or null when R2 is not set up on this deployment. */
export function useR2(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null

  return {
    accountId,
    bucket,
    publicUrl,
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' }),
  }
}

/** The S3-style endpoint for one object. Not public — for signing only. */
export function r2ObjectUrl(cfg: R2Config, key: string) {
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`
}

/** Uploads bytes we already hold (avatars are small enough to pass through). */
export async function r2Put(cfg: R2Config, key: string, body: BodyInit, contentType: string) {
  const res = await cfg.client.fetch(r2ObjectUrl(cfg, key), {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
  })
  if (!res.ok) throw new Error(`R2 rejected the upload (${res.status}): ${await res.text()}`)
}

/**
 * A URL the launcher can PUT to directly, valid for `expiresIn` seconds. The
 * credentials never leave the server; the signature covers method, key and
 * deadline, so the holder can upload that one object and nothing else.
 */
export async function r2SignedPut(cfg: R2Config, key: string, expiresIn = 3600) {
  const signed = await cfg.client.sign(
    `${r2ObjectUrl(cfg, key)}?X-Amz-Expires=${expiresIn}`,
    { method: 'PUT', aws: { signQuery: true } },
  )
  return signed.url
}

/** A time-limited download URL, so packs need no public bucket policy. */
export async function r2SignedGet(cfg: R2Config, key: string, expiresIn = 900) {
  const signed = await cfg.client.sign(
    `${r2ObjectUrl(cfg, key)}?X-Amz-Expires=${expiresIn}`,
    { method: 'GET', aws: { signQuery: true } },
  )
  return signed.url
}

/**
 * The stored size of an object, or null if it is not there.
 *
 * A presigned PUT cannot cap how many bytes arrive, so what the uploader
 * *claimed* is worth nothing — this is how the server finds out what actually
 * landed before it lets a pack go live.
 */
export async function r2Size(cfg: R2Config, key: string): Promise<number | null> {
  const res = await cfg.client.fetch(r2ObjectUrl(cfg, key), { method: 'HEAD' })
  if (!res.ok) return null
  const length = Number(res.headers.get('content-length'))
  return Number.isFinite(length) ? length : null
}

/** Best-effort delete. A missing object is already the desired state. */
export async function r2Delete(cfg: R2Config, key: string) {
  try {
    const res = await cfg.client.fetch(r2ObjectUrl(cfg, key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) {
      console.error('[r2] delete failed', key, res.status)
      return false
    }
    return true
  } catch (e) {
    console.error('[r2] delete failed', key, e)
    return false
  }
}

/** How long a presigned upload URL stays usable — a 1 GB pack needs a while. */
export const UPLOAD_URL_TTL = 2 * 60 * 60
