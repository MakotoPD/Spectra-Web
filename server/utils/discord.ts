// Discord's REST API, called with the bot's token.
//
// This is the half of "the Discord bot" that does not need a bot process at
// all: anything the panel does because someone clicked a button is a plain
// HTTPS request, and the gateway connection is only required for the other
// direction — reacting to things that happen on the server. So sending,
// editing and listing all live here, and the bot repo owns joins, tickets and
// slash commands.
//
// Credentials come straight from `process.env` rather than through
// `runtimeConfig`. See `secrets.ts`: a runtimeConfig default is evaluated when
// the config is *built*, which inside `docker build` means an empty string, and
// only a `NUXT_`-prefixed variable overrides it at run time. DATABASE_URL and
// the R2 keys dodge that by being read directly, and so do these.

import { q } from './db'

const API = 'https://discord.com/api/v10'
const CACHE_TTL = 5 * 60 * 1000

export interface DiscordConfig {
  token: string
  guildId: string
}

/** The configured bot, or null when Discord is not set up on this deployment. */
export function useDiscord(): DiscordConfig | null {
  const token = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID
  if (!token || !guildId) return null
  return { token, guildId }
}

/** The configured bot, or a 501 — for routes that cannot do anything without it. */
export function requireDiscord(): DiscordConfig {
  const cfg = useDiscord()
  if (!cfg) throw createError({ statusCode: 501, statusMessage: 'Discord is not configured' })
  return cfg
}

const cache = new Map<string, { data: unknown, at: number }>()

/** Drops the cached channel/role lists — call after anything that changes them. */
export function clearDiscordCache() {
  cache.clear()
}

async function cached<T>(key: string, load: () => Promise<T>, ttl = CACHE_TTL): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  const data = await load()
  cache.set(key, { data, at: Date.now() })
  return data
}

export async function discordRequest<T = unknown>(
  cfg: DiscordConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bot ${cfg.token}`,
      'content-type': 'application/json',
      // Shows up next to the action in the server's audit log, so a moderator
      // wondering where a ban came from can see it was the panel.
      'x-audit-log-reason': encodeURIComponent('Spectra admin panel'),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { message?: string, retry_after?: number } | null
    // 429 is the one worth spelling out: it is not a bug to fix, it is a wait.
    const message = res.status === 429 && detail?.retry_after
      ? `Discord rate limit — retry in ${Math.ceil(detail.retry_after)}s`
      : detail?.message || `Discord API error ${res.status}`
    throw createError({ statusCode: res.status, statusMessage: message })
  }

  return (res.status === 204 ? null : await res.json()) as T
}

export interface DiscordChannel {
  id: string
  name: string
  type: number
  parent_id: string | null
  position: number
}

/** Channel types the panel can post into: text, announcement, and their threads. */
const POSTABLE_TYPES = new Set([0, 5, 10, 11, 12])

/** Every channel in the guild, cached — the list changes rarely and is read often. */
export function guildChannels(cfg: DiscordConfig) {
  return cached(`channels:${cfg.guildId}`, () =>
    discordRequest<DiscordChannel[]>(cfg, 'GET', `/guilds/${cfg.guildId}/channels`))
}

/** Only the channels a message can actually be sent to, in the server's own order. */
export async function postableChannels(cfg: DiscordConfig) {
  const all = await guildChannels(cfg)
  const categories = new Map(all.filter(c => c.type === 4).map(c => [c.id, c.name]))
  return all
    .filter(c => POSTABLE_TYPES.has(c.type))
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      id: c.id,
      name: c.name,
      category: c.parent_id ? categories.get(c.parent_id) ?? null : null,
    }))
}

/**
 * The bot's own account. Cached for the process lifetime — it cannot change
 * without a redeploy, and it is what tells apart "a message we may edit" from
 * "a message some other bot posted", which Discord refuses to let anyone edit.
 */
export function botUser(cfg: DiscordConfig) {
  return cached(
    'me',
    () => discordRequest<{ id: string, username: string }>(cfg, 'GET', '/users/@me'),
    Infinity,
  )
}

export interface DiscordEmoji {
  id: string
  name: string
  animated: boolean
  available: boolean
  managed: boolean
}

/**
 * The server's own emoji.
 *
 * `available: false` means the guild dropped below the boost level that granted
 * the slot — the emoji still exists and still lists, but Discord refuses to
 * render it, so offering it would only produce broken messages.
 *
 * The bot needs no permission to use these beyond being in the guild.
 */
export async function guildEmojis(cfg: DiscordConfig) {
  const emojis = await cached(`emojis:${cfg.guildId}`, () =>
    discordRequest<DiscordEmoji[]>(cfg, 'GET', `/guilds/${cfg.guildId}/emojis`))
  return emojis
    .filter(e => e.available !== false && e.id)
    .map(e => ({
      id: e.id,
      name: e.name,
      animated: !!e.animated,
      // What goes into message text. Animated emoji take `<a:` — using `<:` for
      // one renders as literal text rather than as the emoji.
      markup: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`,
    }))
}

export interface DiscordRole {
  id: string
  name: string
  color: number
  position: number
  managed: boolean
}

/**
 * Roles that can be handed out. `@everyone` and bot-managed roles are dropped:
 * neither can be assigned, so offering them is offering a guaranteed failure.
 */
export async function assignableRoles(cfg: DiscordConfig) {
  const roles = await cached(`roles:${cfg.guildId}`, () =>
    discordRequest<DiscordRole[]>(cfg, 'GET', `/guilds/${cfg.guildId}/roles`))
  return roles
    .filter(r => !r.managed && r.id !== cfg.guildId)
    .sort((a, b) => b.position - a.position)
    .map(r => ({ id: r.id, name: r.name, color: r.color }))
}

/** A Discord snowflake, which is all an id ever is. */
export const isSnowflake = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{17,20}$/.test(v)

/** Reads a snowflake out of a request body, or 400s with the field's name. */
export function requireSnowflake(value: unknown, field: string): string {
  if (!isSnowflake(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a Discord id` })
  }
  return value
}

/**
 * The Spectra accounts behind a set of Discord ids.
 *
 * better-auth already stores this: signing in with Discord writes a row in
 * `account` with `providerId = 'discord'` and `accountId` set to the member's
 * snowflake. So the bridge between a Discord member, a Spectra account and the
 * Minecraft name attached to it is one join, not a new table to keep in sync.
 */
export async function spectraAccountsFor(discordIds: string[]) {
  if (!discordIds.length) return new Map<string, SpectraLink>()

  const rows = await q<SpectraLink & { discordId: string }>(
    `SELECT a."accountId" AS "discordId", u.id, u.username, u.name, u."mcUsername", u.banned
     FROM account a
     JOIN "user" u ON u.id = a."userId"
     WHERE a."providerId" = 'discord' AND a."accountId" = ANY($1)`,
    [discordIds],
  )
  return new Map(rows.map(r => [r.discordId, r]))
}

export interface SpectraLink {
  id: string
  username: string | null
  name: string | null
  mcUsername: string | null
  banned: boolean | null
}
