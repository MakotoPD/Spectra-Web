// Validating an embed-and-components payload before Discord sees it.
//
// Discord answers a malformed message with a 400 whose body is a nested map of
// field paths — accurate, and unreadable in a toast. Everything below is a rule
// straight out of the API reference, checked here so the panel can say which
// field is wrong in a sentence.
//
// The builder in the browser enforces the same limits while typing. This is the
// copy that matters: the browser's is a convenience, this one is the contract.

/** https://docs.discord.com/developers/resources/message — embed limits */
const EMBED = {
  perMessage: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  authorName: 256,
  /** Summed across *every* embed on the message, not per embed. */
  totalCharacters: 6000,
} as const

/** https://docs.discord.com/developers/components/reference */
const COMPONENT = {
  actionRows: 5,
  buttonsPerRow: 5,
  label: 80,
  customId: 100,
  url: 512,
  placeholder: 150,
  selectOptions: 25,
} as const

/** Button styles that carry a custom_id. Style 5 (link) carries a url instead. */
const CUSTOM_ID_STYLES = new Set([1, 2, 3, 4])
const LINK_STYLE = 5
/** Select menus: string, user, role, mentionable, channel. Each fills a row. */
const SELECT_TYPES = new Set([3, 5, 6, 7, 8])

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  author?: { name: string, url?: string, icon_url?: string }
  footer?: { text: string, icon_url?: string }
  image?: { url: string }
  thumbnail?: { url: string }
  fields?: { name: string, value: string, inline?: boolean }[]
}

export interface DiscordComponent {
  type: number
  style?: number
  label?: string
  custom_id?: string
  url?: string
  emoji?: { name?: string, id?: string, animated?: boolean }
  placeholder?: string
  options?: { label: string, value: string, description?: string }[]
  disabled?: boolean
}

export interface DiscordActionRow {
  type: 1
  components: DiscordComponent[]
}

const bad = (message: string): never => {
  throw createError({ statusCode: 400, statusMessage: message })
}

const text = (value: unknown, limit: number, field: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const str = String(value)
  if (str.length > limit) bad(`${field} is ${str.length} characters, Discord allows ${limit}`)
  return str
}

/** A URL Discord will accept in an embed. Anything else it rejects outright. */
const url = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const str = String(value)
  if (!/^https?:\/\//i.test(str)) bad(`${field} must start with http:// or https://`)
  if (str.length > COMPONENT.url) bad(`${field} is longer than ${COMPONENT.url} characters`)
  return str
}

/**
 * Normalises one embed and drops every empty field, because Discord rejects
 * `{"title": ""}` where it happily accepts the key being absent — and a builder
 * with untouched inputs produces exactly that.
 */
function cleanEmbed(raw: unknown, index: number): DiscordEmbed | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, any>
  const at = `embed ${index + 1}`
  const embed: DiscordEmbed = {}

  const title = text(input.title, EMBED.title, `${at} title`)
  if (title) embed.title = title

  const description = text(input.description, EMBED.description, `${at} description`)
  if (description) embed.description = description

  const link = url(input.url, `${at} title link`)
  if (link) embed.url = link

  // The builder sends "#5865f2"; the API wants the same value as an integer.
  if (input.color !== undefined && input.color !== null && input.color !== '') {
    const parsed = typeof input.color === 'number'
      ? input.color
      : parseInt(String(input.color).replace('#', ''), 16)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffffff) {
      bad(`${at} colour is not a valid hex colour`)
    }
    embed.color = parsed
  }

  if (input.author?.name) {
    embed.author = {
      name: text(input.author.name, EMBED.authorName, `${at} author name`)!,
      ...(url(input.author.url, `${at} author link`) ? { url: input.author.url } : {}),
      ...(url(input.author.icon_url, `${at} author icon`) ? { icon_url: input.author.icon_url } : {}),
    }
  }

  if (input.footer?.text) {
    embed.footer = {
      text: text(input.footer.text, EMBED.footer, `${at} footer`)!,
      ...(url(input.footer.icon_url, `${at} footer icon`) ? { icon_url: input.footer.icon_url } : {}),
    }
  }

  const image = url(input.image?.url ?? input.image, `${at} image`)
  if (image) embed.image = { url: image }

  const thumbnail = url(input.thumbnail?.url ?? input.thumbnail, `${at} thumbnail`)
  if (thumbnail) embed.thumbnail = { url: thumbnail }

  if (Array.isArray(input.fields)) {
    // A field needs both halves — Discord rejects one with an empty value, and
    // a half-filled row is the normal state of a form someone is still editing.
    const fields = input.fields.filter((f: any) => f?.name && f?.value)
    if (fields.length > EMBED.fields) {
      bad(`${at} has ${fields.length} fields, Discord allows ${EMBED.fields}`)
    }
    if (fields.length) {
      embed.fields = fields.map((f: any, i: number) => ({
        name: text(f.name, EMBED.fieldName, `${at} field ${i + 1} name`)!,
        value: text(f.value, EMBED.fieldValue, `${at} field ${i + 1} value`)!,
        inline: !!f.inline,
      }))
    }
  }

  if (input.timestamp) embed.timestamp = new Date().toISOString()

  // Colour alone is not a message. Without this, a builder left untouched would
  // post an empty grey bar.
  const hasContent = embed.title || embed.description || embed.author || embed.footer
    || embed.image || embed.thumbnail || embed.fields?.length
  return hasContent ? embed : null
}

/** The characters Discord counts toward the 6000 limit. */
function embedLength(embed: DiscordEmbed): number {
  return (embed.title?.length ?? 0)
    + (embed.description?.length ?? 0)
    + (embed.author?.name.length ?? 0)
    + (embed.footer?.text.length ?? 0)
    + (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
}

export function cleanEmbeds(raw: unknown): DiscordEmbed[] {
  if (!Array.isArray(raw)) return []
  if (raw.length > EMBED.perMessage) {
    bad(`${raw.length} embeds, Discord allows ${EMBED.perMessage} per message`)
  }

  const embeds = raw
    .map((e, i) => cleanEmbed(e, i))
    .filter((e): e is DiscordEmbed => e !== null)

  const total = embeds.reduce((sum, e) => sum + embedLength(e), 0)
  if (total > EMBED.totalCharacters) {
    bad(`embeds total ${total} characters, Discord allows ${EMBED.totalCharacters} across a message`)
  }
  return embeds
}

function cleanButton(raw: DiscordComponent, at: string): DiscordComponent {
  const style = Number(raw.style)
  if (style !== LINK_STYLE && !CUSTOM_ID_STYLES.has(style)) {
    bad(`${at}: unknown button style ${raw.style}`)
  }

  const label = text(raw.label, COMPONENT.label, `${at} label`)
  // A button with neither is a blank rectangle Discord refuses to render.
  if (!label && !raw.emoji?.name) bad(`${at} needs a label or an emoji`)

  const button: DiscordComponent = { type: 2, style }
  if (label) button.label = label

  // Two different things share this field. A unicode emoji is `{ name: "🎫" }`;
  // one of the server's own is `{ id, name, animated }`, and dropping the id
  // would turn it into a lookup for a unicode character named "spectra_logo".
  if (raw.emoji?.id) {
    button.emoji = {
      id: String(raw.emoji.id),
      name: String(raw.emoji.name ?? ''),
      ...(raw.emoji.animated ? { animated: true } : {}),
    }
  } else if (raw.emoji?.name) {
    button.emoji = { name: String(raw.emoji.name) }
  }

  if (raw.disabled) button.disabled = true

  if (style === LINK_STYLE) {
    // The two are mutually exclusive in the API, not merely optional.
    const href = url(raw.url, `${at} link`)
    if (!href) bad(`${at} is a link button and needs a URL`)
    button.url = href
    return button
  }

  const customId = text(raw.custom_id, COMPONENT.customId, `${at} custom id`)
  if (!customId) bad(`${at} needs a custom id, or make it a link button`)
  button.custom_id = customId
  return button
}

function cleanSelect(raw: DiscordComponent, at: string): DiscordComponent {
  const customId = text(raw.custom_id, COMPONENT.customId, `${at} custom id`)
  if (!customId) bad(`${at} needs a custom id`)

  const select: DiscordComponent = { type: Number(raw.type), custom_id: customId }
  const placeholder = text(raw.placeholder, COMPONENT.placeholder, `${at} placeholder`)
  if (placeholder) select.placeholder = placeholder

  if (Number(raw.type) === 3) {
    const options = (raw.options ?? []).filter(o => o?.label && o?.value)
    if (!options.length) bad(`${at} is a dropdown and needs at least one option`)
    if (options.length > COMPONENT.selectOptions) {
      bad(`${at} has ${options.length} options, Discord allows ${COMPONENT.selectOptions}`)
    }
    select.options = options.map(o => ({
      label: text(o.label, COMPONENT.label, `${at} option label`)!,
      value: text(o.value, COMPONENT.customId, `${at} option value`)!,
      ...(o.description ? { description: text(o.description, COMPONENT.placeholder, `${at} option description`) } : {}),
    }))
  }

  return select
}

export function cleanComponents(raw: unknown): DiscordActionRow[] {
  if (!Array.isArray(raw)) return []

  // Empty rows are dropped rather than rejected: adding a row and then not
  // filling it is a normal step in building a message, not a mistake to punish.
  const rows = raw.filter((r: any) => Array.isArray(r?.components) && r.components.length)
  if (rows.length > COMPONENT.actionRows) {
    bad(`${rows.length} rows of buttons, Discord allows ${COMPONENT.actionRows}`)
  }

  return rows.map((row: any, ri: number) => {
    const at = `row ${ri + 1}`
    const items: DiscordComponent[] = row.components

    const hasSelect = items.some(c => SELECT_TYPES.has(Number(c.type)))
    if (hasSelect) {
      // Not a limit that can be worked around — a select fills its row.
      if (items.length > 1) bad(`${at}: a dropdown has to sit in a row of its own`)
      return { type: 1 as const, components: [cleanSelect(items[0]!, `${at} dropdown`)] }
    }

    if (items.length > COMPONENT.buttonsPerRow) {
      bad(`${at} has ${items.length} buttons, Discord allows ${COMPONENT.buttonsPerRow} per row`)
    }
    return {
      type: 1 as const,
      components: items.map((c, ci) => cleanButton(c, `${at} button ${ci + 1}`)),
    }
  })
}

/**
 * The custom ids the bot in the dc-bot repo actually listens for.
 *
 * A button with any other id renders fine and then answers "This interaction
 * failed" when pressed, because nothing is on the other end. The panel cannot
 * refuse those — a custom id may well be for a handler that is about to be
 * written — so it warns instead, and this is the list it warns against.
 */
export const HANDLED_CUSTOM_IDS = ['open_ticket', 'close_ticket'] as const

/** Custom ids used by the payload that nothing in the bot answers. */
export function unhandledCustomIds(rows: DiscordActionRow[]): string[] {
  const ids = rows
    .flatMap(r => r.components)
    .map(c => c.custom_id)
    .filter((id): id is string => !!id)
  return [...new Set(ids.filter(id => !HANDLED_CUSTOM_IDS.includes(id as never)))]
}
