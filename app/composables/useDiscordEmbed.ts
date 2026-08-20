// Moving between the two shapes an embed has.
//
// Discord's wire format is sparse: absent keys, `color` as an integer, `image`
// as `{ url }`. A form needs the opposite — every field present, every string a
// string, so `v-model` has something to bind to and nothing is `undefined`
// halfway through typing.
//
// The draft is what gets sent: the server's `cleanEmbeds` accepts `#rrggbb` and
// drops the empty keys, which keeps one conversion instead of two.

import type { EmbedDraft } from '~/components/DiscordEmbedBuilder.vue'
import type { RowDraft } from '~/components/DiscordComponentsBuilder.vue'

/** Discord blurple, which is what its own client uses for an embed with no colour. */
export const DEFAULT_EMBED_COLOR = '#5865f2'

export function emptyEmbed(): EmbedDraft {
  return {
    title: '',
    description: '',
    url: '',
    color: DEFAULT_EMBED_COLOR,
    author: { name: '', url: '', icon_url: '' },
    footer: { text: '', icon_url: '' },
    image: { url: '' },
    thumbnail: { url: '' },
    fields: [],
    timestamp: false,
  }
}

/** An embed as Discord returned it, filled out into something a form can bind. */
export function embedToDraft(raw: unknown): EmbedDraft {
  const api = (raw ?? {}) as Record<string, any>
  const draft = emptyEmbed()

  draft.title = api.title ?? ''
  draft.description = api.description ?? ''
  draft.url = api.url ?? ''
  // Comes back as an integer; the colour input needs six hex digits, zero-padded
  // or `#5865f2` becomes `#5865f` and the swatch goes black.
  if (typeof api.color === 'number') {
    draft.color = `#${api.color.toString(16).padStart(6, '0')}`
  }

  if (api.author) {
    draft.author = {
      name: api.author.name ?? '',
      url: api.author.url ?? '',
      icon_url: api.author.icon_url ?? '',
    }
  }
  if (api.footer) {
    draft.footer = { text: api.footer.text ?? '', icon_url: api.footer.icon_url ?? '' }
  }
  // Tolerates both `{ url }` and a bare string: the welcome rows written before
  // this builder existed stored the flat form.
  draft.image = { url: api.image?.url ?? (typeof api.image === 'string' ? api.image : '') }
  draft.thumbnail = { url: api.thumbnail?.url ?? (typeof api.thumbnail === 'string' ? api.thumbnail : '') }

  if (Array.isArray(api.fields)) {
    draft.fields = api.fields.map((f: any) => ({
      name: f?.name ?? '',
      value: f?.value ?? '',
      inline: !!f?.inline,
    }))
  }

  draft.timestamp = !!api.timestamp
  return draft
}

/** Action rows as Discord returned them, with the keys a form expects present. */
export function componentsToDraft(raw: unknown): RowDraft[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row: any) => Array.isArray(row?.components))
    .map((row: any) => ({
      type: 1 as const,
      components: row.components.map((c: any) => ({
        type: c.type,
        ...(c.style !== undefined ? { style: c.style } : {}),
        ...(c.label !== undefined ? { label: c.label } : {}),
        // Never both — the API rejects a component carrying the two, and the
        // builder decides which one by style.
        ...(c.custom_id !== undefined ? { custom_id: c.custom_id } : {}),
        ...(c.url !== undefined ? { url: c.url } : {}),
        ...(c.placeholder !== undefined ? { placeholder: c.placeholder } : {}),
        ...(Array.isArray(c.options)
          ? {
              options: c.options.map((o: any) => ({
                label: o?.label ?? '',
                value: o?.value ?? '',
                ...(o?.description ? { description: o.description } : {}),
              })),
            }
          : {}),
      })),
    }))
}
