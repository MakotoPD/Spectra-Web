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
  }
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

  const notes = String(release.body ?? '').trim()
  const url = release.html_url ?? ''

  try {
    const sentMessage = await discordRequest<{ id: string }>(
      cfg, 'POST', `/channels/${channelId}/messages`, {
        embeds: [{
          title: release.name || `Spectra Launcher ${tag.replace(/^v/, '')}`,
          ...(url ? { url } : {}),
          description: notes.length > MAX_NOTES
            ? `${notes.slice(0, MAX_NOTES)}…\n\n[Read the rest on GitHub](${url})`
            : notes,
          color: SPECTRA_GREEN,
          ...(release.published_at ? { timestamp: release.published_at } : {}),
          footer: { text: 'Spectra Launcher' },
        }],
        // A release note is allowed to contain an @ that means nothing here.
        allowed_mentions: { parse: [] },
      })
    return { ok: true, messageId: sentMessage.id }
  } catch (e) {
    await exec('DELETE FROM discord_releases WHERE release_id = $1', [String(release.id)])
    throw e
  }
})
