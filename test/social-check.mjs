// End-to-end check of accounts → friends → share → push update.
// Run against a dev server: pnpm dev, then `pnpm check:social`.
//
// With Turnstile switched on, start the server with Cloudflare's always-passes
// test secret — this script has no browser to solve a challenge in:
// (Nuxt refuses a second dev server, so stop the running one first.)
//   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA pnpm dev
//   pnpm check:social
import assert from 'node:assert'
import Database from 'better-sqlite3'

const ORIGIN = process.env.CHECK_URL || 'http://localhost:3000'
const API = `${ORIGIN}/api`
const rnd = Math.random().toString(36).slice(2, 8)

async function call(path, { token, method = 'GET', body, raw, rawType, query } = {}) {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method,
    headers: {
      // better-auth rejects a null Origin (CSRF); non-browser clients — this
      // script, and the launcher — must name the origin they are talking to.
      origin: ORIGIN,
      // Same soft anti-spam key the launcher sends on share uploads.
      'x-spectra-key': process.env.SPECTRA_INGEST_KEY ?? '',
      // Cloudflare's dummy token: accepted by the test secret, rejected by a real one.
      'x-captcha-response': 'XXXX.DUMMY.TOKEN.XXXX',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(raw ? { 'content-type': rawType ?? 'application/zip' } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  })
  const text = await res.text()
  const json = text.startsWith('{') ? JSON.parse(text) : text
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`)
  return json
}

// Signing up returns no session while e-mail verification is enforced, and this
// script has no inbox — so confirm the address straight in the database and sign
// in normally. Everything after this point goes through the real API.
const db = new Database(process.env.APP_DB_PATH || './data/app.db')

async function signup(n) {
  const email = `${n}-${rnd}@example.com`
  const password = 'hunter2hunter2'
  await call('/auth/sign-up/email', {
    method: 'POST',
    body: { email, password, name: n, username: `${n}${rnd}` },
  })
  db.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run(email)
  const { token } = await call('/auth/sign-in/email', { method: 'POST', body: { email, password } })
  assert.ok(token, 'sign-in must return a bearer token')
  return token
}

const a = await signup('alice')
const b = await signup('bob')
console.log('✓ two accounts')

// --- friends ---
const req = await call('/friends', { token: a, method: 'POST', body: { query: `bob${rnd}` } })
assert.equal(req.status, 'pending')
const inbox = await call('/friends', { token: b })
assert.equal(inbox.incoming.length, 1, 'bob should see one request')
await call(`/friends/${inbox.incoming[0].id}`, { token: b, method: 'PATCH', body: { action: 'accept' } })
assert.equal((await call('/friends', { token: a })).friends.length, 1)
console.log('✓ friend request → accept')

// --- share upload (owned) ---
const pack = Buffer.from('PK\x03\x04 pretend this is a share pack')
const up = await call('/share', {
  token: a, method: 'POST', raw: pack,
  query: { name: 'Plane Gang', mc: '1.21.1', loader: 'neoforge', mods: '19', instance: `inst-${rnd}` },
})
assert.equal(up.revision, 1)
assert.equal(up.pushed, false)
console.log('✓ upload owned share', up.code)

// --- invite ---
const sent = await call(`/share/${up.code}/invite`, {
  token: a, method: 'POST',
  body: { userIds: [(await call('/friends', { token: a })).friends[0].id] },
})
assert.equal(sent.sent, 1)
const notes = await call('/notifications', { token: b })
assert.equal(notes.notifications[0].kind, 'instance_invite')
assert.equal(notes.notifications[0].shareCode, up.code)
assert.equal(notes.unread, 2) // friend_accepted + the invite
console.log('✓ invite notified')

// --- bob installs it, so he is subscribed at revision 1 ---
await call(`/share/${up.code}`, { token: b })
let mine = await call('/shares', { token: a })
assert.equal(mine.shares[0].recipients[0].importedRevision, 1)
assert.equal(mine.shares[0].recipients[0].outdated, false)

// --- alice pushes an update: same code, next revision ---
const push = await call('/share', {
  token: a, method: 'POST', raw: Buffer.concat([pack, Buffer.from(' v2')]),
  query: { name: 'Plane Gang', mc: '1.21.1', loader: 'neoforge', mods: '20', instance: `inst-${rnd}` },
})
assert.equal(push.code, up.code, 'a push must reuse the code')
assert.equal(push.revision, 2)
assert.equal(push.pushed, true)

const after = await call('/notifications', { token: b })
assert.equal(after.notifications[0].kind, 'instance_update')
mine = await call('/shares', { token: a })
assert.equal(mine.shares[0].recipients[0].outdated, true)
console.log('✓ push update → notification + outdated recipient')

// --- avatar upload (skipped when R2 is not configured) ---
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
try {
  const { url } = await call('/me/avatar', { token: a, method: 'POST', raw: PNG_1PX, rawType: 'image/png' })
  assert.ok(url.startsWith('http'), 'avatar upload must return a public URL')
  const head = await fetch(url)
  assert.ok(head.ok, `uploaded avatar is not publicly readable: ${head.status}`)
  console.log('✓ avatar upload → R2')
} catch (e) {
  if (!String(e.message).includes('501')) throw e
  console.log('— avatar upload skipped (R2 not configured)')
}

// --- an anonymous upload still behaves like before ---
const anon = await call('/share', { method: 'POST', raw: pack, query: { name: 'Anon' } })
assert.ok(anon.expires < Date.now() + 8 * 86400000, 'anonymous codes keep the 7-day TTL')
console.log('✓ anonymous share unchanged')

console.log('\nall good')
