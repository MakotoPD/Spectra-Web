// Announces a release that is already published.
//
// A webhook only delivers what happens after it exists, so a release published
// before it was set up has no delivery to redeliver — and neither does one whose
// delivery failed and aged out. This fetches that release from GitHub, wraps it
// in the same `action: published` envelope the webhook would have carried, signs
// it with the same secret and posts it at the same endpoint. The server cannot
// tell the difference, which is the point: it exercises the real path.
//
//   node test/announce-release.mjs v0.7.1
//
// Reads GITHUB_WEBHOOK_SECRET (and NUXT_PUBLIC_SITE_URL) from .env the way the
// server does, so a local .env is enough. SITE=… overrides the target.
import fs from 'node:fs'
import { createHmac } from 'node:crypto'

// Run from a checkout it reads .env; run on the server there is none, and the
// environment already holds what it needs.
const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : ''
for (const line of envFile.split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue
  const at = line.indexOf('=')
  const key = line.slice(0, at).trim()
  if (!(key in process.env)) process.env[key] = line.slice(at + 1).trim().replace(/^["']|["']$/g, '')
}

const REPO = process.env.RELEASE_REPO || 'MakotoPD/Spectra-Launcher'
const SECRET = process.env.GITHUB_WEBHOOK_SECRET
const SITE = process.env.SITE || process.env.NUXT_PUBLIC_SITE_URL || 'https://spectra.makoto.com.pl'
const tag = process.argv[2]

if (!SECRET) {
  console.error('GITHUB_WEBHOOK_SECRET is not set — the server would answer 501')
  process.exit(1)
}
if (!tag) {
  console.error('usage: node test/announce-release.mjs <tag>   e.g. v0.7.1')
  process.exit(1)
}

const api = `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
const res = await fetch(api, { headers: { accept: 'application/vnd.github+json' } })
if (!res.ok) {
  console.error(`GitHub says ${res.status} for ${tag} — is that tag published?`)
  process.exit(1)
}
const release = await res.json()

if (release.draft) {
  console.error(`${tag} is still a draft; publish it and the webhook fires on its own`)
  process.exit(1)
}

const body = JSON.stringify({ action: 'published', release })
const sent = await fetch(`${SITE}/api/hooks/github-release`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-github-event': 'release',
    'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
  },
  body,
})

console.log(`${tag} → ${release.assets.length} files`)
console.log(`HTTP ${sent.status} — ${(await sent.text()).slice(0, 300)}`)
