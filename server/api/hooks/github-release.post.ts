// Announces a launcher release on Discord, from GitHub's `release` webhook.
//
// The trigger is deliberately the webhook and not a step in the launcher's build
// workflow: that workflow creates a *draft* release, so at build time there is
// nothing anyone can download yet. `action: published` is the moment the draft
// is made public, which is the moment worth announcing.
//
// Sending lives here rather than in the bot for the reason the bot's README
// gives: a message the panel could have sent is a plain HTTPS request, and the
// gateway connection is only needed for things that happen *on* Discord.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Embed descriptions cap at 4096; the rest is room for the "read the rest" line. */
const MAX_NOTES = 3800

/** The green off the launcher's Play button. */
const SPECTRA_GREEN = 0x3fb877

/**
 * The generated release body leads with a markdown table of download links, and
 * Discord renders no tables — it would arrive as a wall of pipes and dashes. The
 * changelog below that heading is the half worth reading here; the links live one
 * click away, on the release the embed title points at.
 */
function changelogOnly(body: string): string {
  const at = body.indexOf("What's Changed")
  if (at === -1) return body.trim()
  const eol = body.indexOf('\n', at)
  return eol === -1 ? '' : body.slice(eol + 1).trim()
}

interface ReleaseAsset {
  name?: string
  browser_download_url?: string
}

interface ReleasePayload {
  action?: string
  release?: {
    id?: number
    tag_name?: string
    name?: string
    body?: string
    html_url?: string
    draft?: boolean
    prerelease?: boolean
    published_at?: string
    assets?: ReleaseAsset[]
  }
}

/**
 * Download buttons, built from the files GitHub says are actually on the
 * release rather than from a guess at their names — the workflow renames
 * assets (spaces become dots) and a button pointing at a 404 is worse than no
 * button. One row, and Discord allows five buttons in it.
 */
const PLATFORMS: { label: string, emoji: string, match: (name: string) => boolean }[] = [
  { label: 'Windows', emoji: '🪟', match: n => n.endsWith('-setup.exe') },
  { label: 'macOS (M1+)', emoji: '🍎', match: n => n.endsWith('aarch64.dmg') },
  { label: 'macOS (Intel)', emoji: '🍎', match: n => n.endsWith('x64.dmg') },
  { label: 'Linux (AppImage)', emoji: '🐧', match: n => n.endsWith('.AppImage') },
  { label: 'Linux (deb)', emoji: '🐧', match: n => n.endsWith('.deb') },
]

function downloadButtons(assets: ReleaseAsset[], releaseUrl: string) {
  const buttons = PLATFORMS.flatMap((p) => {
    const hit = assets.find(a => a.name && a.browser_download_url && p.match(a.name))
    return hit
      ? [{ type: 2, style: 5, label: p.label, emoji: { name: p.emoji }, url: hit.browser_download_url! }]
      : []
  }).slice(0, 5)

  // Nothing recognised (a hand-made release, say): one button to the page.
  if (!buttons.length && releaseUrl) {
    return [{ type: 1, components: [{ type: 2, style: 5, label: 'Downloads', url: releaseUrl }] }]
  }
  return buttons.length ? [{ type: 1, components: buttons }] : []
}

export default defineEventHandler(async (event) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    throw createError({ statusCode: 501, statusMessage: 'GITHUB_WEBHOOK_SECRET is not set' })
  }

  // The signature covers the bytes GitHub sent, so the raw body has to be
  // hashed before anything parses or re-serialises it.
  const raw = await readRawBody(event, 'utf8')
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'empty body' })

  const sent = Buffer.from(getHeader(event, 'x-hub-signature-256') ?? '')
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`)
  // timingSafeEqual throws on a length mismatch, so that is checked first — and
  // a wrong length is a wrong signature anyway.
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'bad signature' })
  }

  const payload = JSON.parse(raw) as ReleasePayload
  const release = payload.release
  // Everything below is "nothing to do", not a failure: answering 4xx would make
  // GitHub mark the delivery failed and retry something that will never change.
  if (payload.action !== 'published') return { ok: true, skipped: `action ${payload.action}` }
  if (!release?.id || release.draft || release.prerelease) {
    return { ok: true, skipped: 'draft or prerelease' }
  }

  const cfg = useDiscord()
  if (!cfg) return { ok: true, skipped: 'Discord is not configured' }

  const row = await one<{ release_channel: string | null }>(
    'SELECT release_channel FROM discord_config WHERE guild_id = $1', [cfg.guildId])
  const channelId = row?.release_channel
  if (!channelId) return { ok: true, skipped: 'no release channel set in the panel' }

  const tag = String(release.tag_name ?? '')

  // Claiming the id before posting is what makes a redelivery quiet. If the send
  // then fails the claim is released, so the retry GitHub sends can still work.
  const claimed = await exec(
    `INSERT INTO discord_releases (release_id, tag, posted) VALUES ($1, $2, $3)
     ON CONFLICT (release_id) DO NOTHING`,
    [String(release.id), tag, Date.now()])
  if (!claimed) return { ok: true, skipped: 'already announced' }

  const notes = changelogOnly(String(release.body ?? ''))
  const url = release.html_url ?? ''
  const version = tag.replace(/^v/, '')
  const site = process.env.NUXT_PUBLIC_SITE_URL || 'https://spectra.makoto.com.pl'

  try {
    const sentMessage = await discordRequest<{ id: string }>(
      cfg, 'POST', `/channels/${channelId}/messages`, {
        embeds: [{
          author: { name: 'Spectra Launcher', url: site, icon_url: `${site}/logo.png` },
          title: `Version ${version} is out`,
          ...(url ? { url } : {}),
          description: notes.length > MAX_NOTES
            ? `${notes.slice(0, MAX_NOTES)}…\n\n[Read the rest on GitHub](${url})`
            : notes,
          color: SPECTRA_GREEN,
          thumbnail: { url: `${site}/logo-transparent.png` },
          ...(release.published_at ? { timestamp: release.published_at } : {}),
          footer: { text: 'Update from inside the launcher, or grab it below' },
        }],
        components: downloadButtons(release.assets ?? [], url),
        // A release note is allowed to contain an @ that means nothing here.
        allowed_mentions: { parse: [] },
      })
    return { ok: true, messageId: sentMessage.id }
  } catch (e) {
    await exec('DELETE FROM discord_releases WHERE release_id = $1', [String(release.id)])
    throw e
  }
})
