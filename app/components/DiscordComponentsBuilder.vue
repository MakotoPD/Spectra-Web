<script setup lang="ts">
// Buttons and dropdowns, arranged into action rows.
//
// Discord's layout rules are structural, not stylistic, so they are enforced by
// what the buttons here let you do rather than by a validator that complains
// afterwards:
//
//   · a row holds up to 5 buttons, OR exactly one dropdown, never both
//   · at most 5 rows on a message
//   · a link button carries a URL and no custom id; every other style is the
//     other way round — the API rejects a component with both
//
// The one thing this cannot enforce is whether a custom id means anything. A
// button whose id nothing listens for renders perfectly and then answers "This
// interaction failed" when pressed, so ids the bot does not handle are flagged
// as a warning rather than blocked — the handler may be about to be written.

import type { GuildEmoji } from './DiscordEmojiPicker.vue'

export interface ComponentDraft {
  type: number
  style?: number
  label?: string
  custom_id?: string
  url?: string
  /** A server emoji is `{ id, name, animated }`; a unicode one is `{ name }`. */
  emoji?: { id?: string, name?: string, animated?: boolean }
  placeholder?: string
  options?: { label: string, value: string, description?: string }[]
}
export interface RowDraft { type: 1, components: ComponentDraft[] }

const rows = defineModel<RowDraft[]>({ required: true })

const props = defineProps<{ emojis?: GuildEmoji[] }>()

const emojiUrl = (id: string, animated?: boolean) =>
  `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=44`

const MAX_ROWS = 5
const MAX_BUTTONS = 5
const SELECT_TYPES = new Set([3, 6])

/** The ids the bot in the dc-bot repo listens for. Kept in step with it by hand. */
const HANDLED_IDS = ['open_ticket', 'close_ticket']

const STYLES = [
  { value: 1, label: 'Primary', css: 'bg-[#5865f2] text-white' },
  { value: 2, label: 'Secondary', css: 'bg-[#4e5058] text-white' },
  { value: 3, label: 'Success', css: 'bg-[#248046] text-white' },
  { value: 4, label: 'Danger', css: 'bg-[#da373c] text-white' },
  { value: 5, label: 'Link', css: 'bg-[#4e5058] text-white' },
]

const isSelect = (c: ComponentDraft) => SELECT_TYPES.has(c.type)
const rowHasSelect = (row: RowDraft) => row.components.some(isSelect)

/** A row already holding a dropdown is full; one of buttons fills up at five. */
const canAddButton = (row: RowDraft) => !rowHasSelect(row) && row.components.length < MAX_BUTTONS
const canAddSelect = (row: RowDraft) => row.components.length === 0

function describe(row: RowDraft) {
  if (!row.components.length) return 'empty'
  if (rowHasSelect(row)) return row.components[0]!.type === 6 ? 'role dropdown' : 'dropdown'
  return `${row.components.length} button${row.components.length === 1 ? '' : 's'}`
}

function addRow() {
  if (rows.value.length >= MAX_ROWS) return
  rows.value.push({ type: 1, components: [] })
}

function addButton(row: RowDraft, style: number) {
  // Set the field the style actually uses and leave the other absent — sending
  // both is what Discord refuses.
  row.components.push(style === 5
    ? { type: 2, style, label: '', url: '' }
    : { type: 2, style, label: '', custom_id: '' })
}

/** Switching to or from Link swaps which field the button carries. */
function setStyle(component: ComponentDraft, style: number) {
  component.style = style
  if (style === 5) {
    delete component.custom_id
    component.url ??= ''
  } else {
    delete component.url
    component.custom_id ??= ''
  }
}

function addSelect(row: RowDraft, type: number) {
  row.components.push(type === 6
    ? { type: 6, custom_id: '', placeholder: '' }
    : { type: 3, custom_id: '', placeholder: '', options: [{ label: '', value: '' }] })
}

/** Custom ids in use that nothing in the bot answers. */
const unhandled = computed(() => {
  const ids = rows.value
    .flatMap(r => r.components)
    .map(c => c.custom_id)
    .filter((id): id is string => !!id)
  return [...new Set(ids.filter(id => !HANDLED_IDS.includes(id)))]
})
</script>

<template>
  <div class="space-y-2">
    <div v-for="(row, ri) in rows" :key="ri" class="rounded-lg border border-white/8">
      <div class="flex items-center gap-2 bg-white/[0.03] px-3 py-2">
        <UIcon name="i-lucide-rows-3" class="size-4 text-white/40" />
        <span class="text-sm font-medium">Row {{ ri + 1 }}</span>
        <span class="text-[11px] text-white/35">{{ describe(row) }}</span>
        <UButton
          class="ms-auto" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2"
          @click="rows.splice(ri, 1)"
        />
      </div>

      <div class="space-y-2 border-t border-white/8 p-3">
        <div v-for="(component, ci) in row.components" :key="ci" class="rounded-lg bg-white/[0.03] p-2.5">
          <!-- button -->
          <template v-if="component.type === 2">
            <div class="mb-2 flex flex-wrap items-center gap-1.5">
              <button
                v-for="style in STYLES" :key="style.value" type="button"
                class="rounded px-2 py-1 text-[11px] font-medium transition"
                :class="[style.css, component.style === style.value ? 'ring-2 ring-white/60' : 'opacity-50 hover:opacity-80']"
                @click="setStyle(component, style.value)"
              >{{ style.label }}</button>
              <UButton
                class="ms-auto" size="xs" color="error" variant="ghost" icon="i-lucide-x"
                @click="row.components.splice(ci, 1)"
              />
            </div>
            <div class="mb-1.5 flex items-center gap-1.5">
              <UInput v-model="component.label" :maxlength="80" size="sm" class="flex-1" placeholder="Label (max 80)" />

              <!-- Shown beside the label because that is where it appears on
                   the button, and it is set as a field rather than typed into
                   the label — markup in a label renders as literal text. -->
              <button
                v-if="component.emoji?.id"
                type="button"
                class="flex size-8 shrink-0 items-center justify-center rounded bg-white/8 transition hover:bg-white/15"
                title="Remove the emoji"
                @click="delete component.emoji"
              >
                <img
                  :src="emojiUrl(component.emoji.id, component.emoji.animated)"
                  :alt="component.emoji.name" class="size-5 object-contain"
                >
              </button>
              <DiscordEmojiPicker
                v-else-if="props.emojis?.length"
                :emojis="props.emojis" mode="button"
                @select="e => component.emoji = { id: e.id, name: e.name, animated: e.animated }"
              />
            </div>
            <UInput
              v-if="component.style === 5"
              v-model="component.url" size="sm" class="w-full" placeholder="https://… (where it goes)"
            />
            <template v-else>
              <UInput v-model="component.custom_id" :maxlength="100" size="sm" class="w-full" placeholder="custom id — what the bot listens for" />
              <div class="mt-1.5 flex flex-wrap gap-1">
                <button
                  v-for="id in HANDLED_IDS" :key="id" type="button"
                  class="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-white/50 transition hover:text-white"
                  @click="component.custom_id = id"
                >{{ id }}</button>
              </div>
            </template>
          </template>

          <!-- dropdown -->
          <template v-else>
            <div class="mb-2 flex items-center gap-2">
              <span class="text-[11px] font-medium text-white/40">
                {{ component.type === 6 ? 'Role dropdown' : 'Dropdown' }}
              </span>
              <UButton
                class="ms-auto" size="xs" color="error" variant="ghost" icon="i-lucide-x"
                @click="row.components.splice(ci, 1)"
              />
            </div>
            <UInput v-model="component.custom_id" :maxlength="100" size="sm" class="mb-1.5 w-full" placeholder="custom id" />
            <UInput v-model="component.placeholder" :maxlength="150" size="sm" class="w-full" placeholder="Placeholder text" />

            <div v-if="component.type === 3" class="mt-2 space-y-1.5">
              <div v-for="(option, oi) in component.options" :key="oi" class="flex gap-1.5">
                <UInput v-model="option.label" size="sm" class="flex-1" placeholder="Option label" />
                <UInput v-model="option.value" size="sm" class="flex-1" placeholder="value" />
                <UButton size="xs" color="error" variant="ghost" icon="i-lucide-x" @click="component.options!.splice(oi, 1)" />
              </div>
              <UButton
                size="xs" color="neutral" variant="soft" icon="i-lucide-plus" label="Add option"
                :disabled="(component.options?.length ?? 0) >= 25"
                @click="component.options!.push({ label: '', value: '' })"
              />
            </div>
          </template>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-if="canAddButton(row)"
            size="xs" color="neutral" variant="soft" icon="i-lucide-plus" label="Button"
            @click="addButton(row, 1)"
          />
          <UButton
            v-if="canAddButton(row)"
            size="xs" color="neutral" variant="soft" icon="i-lucide-external-link" label="Link button"
            @click="addButton(row, 5)"
          />
          <UButton
            v-if="canAddSelect(row)"
            size="xs" color="neutral" variant="soft" icon="i-lucide-list" label="Dropdown"
            @click="addSelect(row, 3)"
          />
          <UButton
            v-if="canAddSelect(row)"
            size="xs" color="neutral" variant="soft" icon="i-lucide-shield" label="Role dropdown"
            @click="addSelect(row, 6)"
          />
          <span v-if="rowHasSelect(row)" class="self-center text-[11px] text-white/30">
            a dropdown fills its row
          </span>
        </div>
      </div>
    </div>

    <UButton
      size="xs" color="neutral" variant="soft" icon="i-lucide-plus"
      :label="`Add a row (${rows.length}/${MAX_ROWS})`"
      :disabled="rows.length >= MAX_ROWS"
      @click="addRow"
    />

    <!-- Not an error: the handler may not be written yet. But hearing it here
         beats hearing it from the first member who presses the button. -->
    <p v-if="unhandled.length" class="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200/90">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
      <span>
        The bot does not listen for
        <code v-for="id in unhandled" :key="id" class="mx-0.5 rounded bg-black/25 px-1 font-mono">{{ id }}</code>.
        These buttons will post fine and then say “This interaction failed” when pressed,
        until a handler for them exists in the dc-bot repo. Link buttons need no bot at all.
      </span>
    </p>
  </div>
</template>
