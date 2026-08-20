// Spectra accounts — the identity that friends lists and instance sharing hang
// off. Everything auth-shaped (passwords, sessions, OAuth, TOTP, reset mails)
// is better-auth's job; we only wire it to Postgres and tell it how to send mail.
//
// Env:
//   DATABASE_URL         — Postgres, shared with everything else on the server
//   BETTER_AUTH_SECRET   — signing secret (required in prod)
//   RESEND_API_KEY       — optional; without it verification/reset mails are
//                          only logged, and e-mail verification is not enforced
//   <PROVIDER>_CLIENT_ID / _CLIENT_SECRET for discord, google, github, microsoft

import type { H3Event } from 'h3'
import { betterAuth } from 'better-auth'
import { bearer, captcha, oneTimeToken, twoFactor, username } from 'better-auth/plugins'

import { usePool } from './db'

let auth: ReturnType<typeof betterAuth> | null = null

/** Providers are only offered if their credentials are actually configured. */
function socialProviders() {
  const ids = ['discord', 'google', 'github', 'microsoft'] as const
  const out: Record<string, { clientId: string, clientSecret: string }> = {}
  for (const id of ids) {
    const clientId = process.env[`${id.toUpperCase()}_CLIENT_ID`]
    const clientSecret = process.env[`${id.toUpperCase()}_CLIENT_SECRET`]
    if (clientId && clientSecret) out[id] = { clientId, clientSecret }
  }
  return out
}

/** Which providers the sign-in page should render buttons for. */
export function enabledProviders(): string[] {
  return Object.keys(socialProviders())
}

/** Public Turnstile key, or '' when the captcha is switched off. */
export function turnstileSiteKey(): string {
  // A widget without a server-side secret would be decoration, so both halves
  // have to be present before the sign-in page renders one.
  return process.env.TURNSTILE_SECRET_KEY ? (process.env.TURNSTILE_SITE_KEY || '') : ''
}

/**
 * Sends one transactional mail through Resend's REST API. No SDK — it is a
 * single POST. Without a key the mail is logged instead, so a fresh dev setup
 * still lets you click the verification link out of the terminal.
 */
async function sendMail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.info(`[mail] ${to} — ${subject}\n${html.replace(/<[^>]+>/g, ' ')}`)
    return
  }
  try {
    await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: {
        // Must sit on a domain the API key is authorised for, otherwise Resend
        // answers 403 "not authorized to send emails from <domain>".
        from: process.env.MAIL_FROM || 'Spectra <noreply@makoto.com.pl>',
        to,
        subject,
        html,
        // A plain-text alternative next to the HTML — spam filters mark
        // HTML-only mail down, and these are the mails that must arrive. The
        // <head> goes first, or the preview text lands in the body twice.
        text: html
          .replace(/<head[\s\S]*?<\/head>/i, '')
          .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      },
    })
  } catch (e: any) {
    // better-auth swallows a throw from here, which turns a misconfigured
    // sender into "the mail simply never arrives". Say so in the log instead.
    console.error('[mail] Resend rejected the send:', e?.data?.message || e?.message || e)
  }
}

/**
 * Origin for images inside e-mails. A mail is read on someone else's machine,
 * so assets must point at production even when a dev server sent it.
 */
function mailAssetOrigin() {
  const configured = (process.env.NUXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return configured && !configured.includes('localhost') ? configured : 'https://spectra.makoto.com.pl'
}

/**
 * One transactional mail body: logo, headline, a line of copy, a button, and
 * the same link in plain text underneath for clients that swallow buttons.
 *
 * Tables and inline styles are not nostalgia — Outlook still ignores flexbox,
 * grid and most of a <style> block, so this is the layout that survives.
 */
function mailTemplate(opts: {
  preheader: string
  title: string
  body: string
  ctaUrl: string
  ctaLabel: string
  footnote: string
}) {
  const site = mailAssetOrigin()
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#05080f;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${opts.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#05080f;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

      <tr><td align="center" style="padding-bottom:22px;">
        <img src="${site}/logo.png" width="34" height="34" alt=""
             style="vertical-align:middle;border:0;display:inline-block;">
        <span style="display:inline-block;vertical-align:middle;padding-left:10px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-.01em;color:#eaf1fb;">
          Spectra<span style="color:#7dd3fc;"> Launcher</span>
        </span>
      </td></tr>

      <tr><td style="background:#0a1120;border:1px solid rgba(125,211,252,.14);border-radius:18px;padding:38px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <h1 style="margin:0 0 12px;font-size:23px;line-height:1.25;font-weight:700;letter-spacing:-.02em;color:#eaf1fb;">${opts.title}</h1>
        <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#aab9d0;">${opts.body}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="#38bdf8" style="border-radius:12px;background-image:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);">
            <a href="${opts.ctaUrl}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#04121f;text-decoration:none;border-radius:12px;">${opts.ctaLabel}</a>
          </td></tr>
        </table>

        <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
          Or paste this link into your browser:<br>
          <a href="${opts.ctaUrl}" style="color:#7dd3fc;word-break:break-all;text-decoration:none;">${opts.ctaUrl}</a>
        </p>

        <div style="height:1px;background:rgba(255,255,255,.08);margin:28px 0 18px;"></div>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">${opts.footnote}</p>
      </td></tr>

      <tr><td align="center" style="padding:22px 8px 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#475569;">
        <a href="${site}" style="color:#64748b;text-decoration:none;">spectra.makoto.com.pl</a>
        &nbsp;·&nbsp; A free, open-source Minecraft launcher.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`
}

/** Lazily builds the better-auth instance (env is read at request time). */
export function useAuth() {
  if (auth) return auth
  const hasMail = !!process.env.RESEND_API_KEY

  auth = betterAuth({
    database: usePool(),
    baseURL: process.env.NUXT_PUBLIC_SITE_URL
      || (import.meta.dev ? 'http://localhost:3000' : 'https://spectra.makoto.com.pl'),
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      // Only enforced once mail actually goes out — otherwise nobody could ever
      // finish a signup on a server without a Resend key.
      requireEmailVerification: hasMail,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(user.email, 'Reset your Spectra password', mailTemplate({
          preheader: 'Set a new password for your Spectra account.',
          title: 'Reset your password',
          body: 'Someone asked to set a new password for your Spectra account. '
            + 'The link below works once and expires in an hour.',
          ctaUrl: url,
          ctaLabel: 'Reset password',
          footnote: 'If this was not you, nothing has changed — you can ignore this message.',
        }))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(user.email, 'Confirm your Spectra account', mailTemplate({
          preheader: 'One click and your Spectra account is ready.',
          title: 'Confirm your e-mail',
          body: `Welcome to Spectra${user.name ? `, ${user.name}` : ''}. Confirm this address to finish `
            + 'setting up your account — then you can add friends and share modpacks straight from the launcher.',
          ctaUrl: url,
          ctaLabel: 'Confirm e-mail',
          footnote: 'If you did not create a Spectra account, you can ignore this message.',
        }))
      },
    },
    user: {
      additionalFields: {
        // The Minecraft profile behind this account. `input: false` matters:
        // these may only ever be written by the verified path in
        // `api/me/minecraft.post.ts`, never by a client update.
        mcUuid: { type: 'string', required: false, input: false },
        mcUsername: { type: 'string', required: false, input: false },
        // Presence: what the player chose to show ('visible' | 'dnd' | 'hidden'),
        // when their launcher last checked in, and whether a game is running.
        // Written only by the presence endpoints, never by a client update.
        presence: { type: 'string', required: false, input: false },
        lastSeen: { type: 'number', required: false, input: false },
        playing: { type: 'boolean', required: false, input: false },
      },
    },
    socialProviders: socialProviders(),
    account: {
      // Signing in with Discord and later with Google on the same verified
      // address lands on one account instead of two half-empty ones.
      accountLinking: { enabled: true, trustedProviders: ['discord', 'google', 'github', 'microsoft'] },
    },
    plugins: [
      username(),
      twoFactor({ issuer: 'Spectra Launcher' }),
      // The launcher talks to this API with `Authorization: Bearer <token>`
      // instead of cookies; `oneTimeToken` is how it gets one (see /launcher/auth).
      bearer(),
      oneTimeToken(),
      // Turnstile in front of sign-up, sign-in and password resets. Only armed
      // when a secret is configured, so local dev needs no Cloudflare account.
      ...(process.env.TURNSTILE_SECRET_KEY
        ? [captcha({ provider: 'cloudflare-turnstile', secretKey: process.env.TURNSTILE_SECRET_KEY })]
        : []),
    ],
  })
  return auth
}

/**
 * The signed-in user for an API route, or 401. Works for both callers: the
 * website sends a session cookie, the launcher an `Authorization: Bearer`
 * header — better-auth resolves either from the same request headers.
 */
export async function requireUser(event: H3Event) {
  const session = await useAuth().api.getSession({ headers: event.headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'sign in first' })
  return session.user
}

/** Same, but returns null instead of throwing — for routes that also serve anonymous callers. */
export async function optionalUser(event: H3Event) {
  const session = await useAuth().api.getSession({ headers: event.headers }).catch(() => null)
  return session?.user ?? null
}
