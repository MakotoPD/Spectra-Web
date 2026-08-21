<script setup lang="ts">
// The Discord half of the admin panel.
//
// Everything here is a REST call to Discord or a row in our own tables. The bot
// process (dc-bot repo) is never contacted: it holds the gateway connection and
// reacts to things that happen *on* Discord, while this side only ever acts
// because someone clicked. The two meet in the database and nowhere else.
//
// Split out of admin.vue because it is six screens' worth of state; the page
// itself only decides which tab is showing.

import type { EmbedDraft } from './DiscordEmbedBuilder.vue'
import type { RowDraft } from './DiscordComponentsBuilder.vue'
import type { GuildEmoji } from './DiscordEmojiPicker.vue'

const emit = defineEmits<{ unauthorized: [] }>()

type Pane = 'overview' | 'messages' | 'moderation' | 'welcome' | 'tickets' | 'config'
const pane = ref<Pane>('overview')

const PANES = [
  { id: 'overview', label: 'Overview', icon: 'i-lucide-gauge' },
  { id: 'messages', label: 'Messages', icon: 'i-lucide-message-square' },
  { id: 'moderation', label: 'Moderation', icon: 'i-lucide-gavel' },
  { id: 'welcome', label: 'Welcome', icon: 'i-lucide-door-open' },
  { id: 'tickets', label: 'Tickets', icon: 'i-lucide-ticket' },
  { id: 'config', label: 'Config', icon: 'i-lucide-settings' },
] as const

const busy = ref('')
const error = ref('')
const notice = ref('')

function fail(e: unknown, fallback: string) {
  const err = e as { statusCode?: number, statusMessage?: string, data?: { message?: string } }
  if (err?.statusCode === 401) {
    emit('unauthorized')
    return ''
  }
  return err?.data?.message || err?.statusMessage || fallback
}

/** Wraps a call so every button shares the same busy/error/notice handling. */
async function run(key: string, fn: () => Promise<string | void>) {
  busy.value = key
  error.value = ''
  notice.value = ''
  try {
    const message = await fn()
    if (message) notice.value = message
  } catch (e) {
    error.value = fail(e, 'Discord refused that')
  } finally {
    busy.value = ''
  }
}

// --- overview --------------------------------------------------------------
interface Stats {
  configured: boolean
  guild?: {
    id: string
    name: string
    icon: string | null
    memberCount: number
    onlineCount: number
    channels: number
    categories: number
  }
  bot?: { id: string, username: string }
  openTickets?: number
  tickets?: number
  warnings?: number
}
const stats = ref<Stats | null>(null)

async function loadStats() {
  await run('stats', async () => {
    stats.value = await $fetch<Stats>('/api/admin/discord/stats')
  })
}

// --- channels & roles (shared by several panes) ----------------------------
interface Named { id: string, name: string }
interface PostableChannel extends Named { category: string | null }

const channels = ref<PostableChannel[]>([])
const textChannels = ref<Named[]>([])
const categories = ref<Named[]>([])
const roles = ref<{ id: string, name: string, color: number }[]>([])

const channelItems = computed(() => channels.value.map(c => ({
  label: c.category ? `${c.category} / #${c.name}` : `#${c.name}`,
  value: c.id,
})))
const textChannelItems = computed(() =>
  [{ label: '— none —', value: '' }, ...textChannels.value.map(c => ({ label: `#${c.name}`, value: c.id }))])
const categoryItems = computed(() =>
  [{ label: '— none —', value: '' }, ...categories.value.map(c => ({ label: c.name, value: c.id }))])

async function loadChannels() {
  channels.value = (await $fetch<{ channels: PostableChannel[] }>('/api/admin/discord/channels')).channels
}

// --- server emoji ----------------------------------------------------------
// Loaded once and shared by every builder on the page: the list changes rarely
// and the endpoint caches it anyway.
const emojis = ref<GuildEmoji[]>([])

async function loadEmojis() {
  if (emojis.value.length) return
  try {
    emojis.value = (await $fetch<{ emojis: GuildEmoji[] }>('/api/admin/discord/emojis')).emojis
  } catch (e) {
    // A server with no custom emoji, or a bot that cannot read them, is not a
    // reason to fail the pane — the picker just stays disabled.
    console.warn('[discord] emoji unavailable', e)
  }
}

// --- messages --------------------------------------------------------------
interface DiscordMessage {
  id: string
  content: string
  embeds: unknown[]
  components: unknown[]
  timestamp: string
  editedAt: string | null
}
const msgChannelId = ref('')
const messages = ref<DiscordMessage[]>([])
const draft = ref('')
const allowMentions = ref(false)
const editingId = ref<string | null>(null)

// The builder's half of the composer. Embeds and rows are arrays because
// Discord allows several of each on one message.
const msgEmbeds = ref<EmbedDraft[]>([])
const msgRows = ref<RowDraft[]>([])
/** Which of the three the composer is showing — all three feed one message. */
const composer = ref<'text' | 'embeds' | 'buttons'>('text')

const MAX_EMBEDS = 10
/** Discord counts this across every embed on the message, not per embed. */
const EMBED_BUDGET = 6000
const embedCharacters = computed(() => msgEmbeds.value.reduce((sum, e) =>
  sum + e.title.length + e.description.length + e.author.name.length + e.footer.text.length
  + e.fields.reduce((s, f) => s + f.name.length + f.value.length, 0), 0))

const composerEmpty = computed(() => !draft.value.trim() && !msgEmbeds.value.length)

const msgChannelName = computed(() => channels.value.find(c => c.id === msgChannelId.value)?.name ?? '')

async function loadMessages() {
  if (!msgChannelId.value) return
  editingId.value = null
  await run('messages', async () => {
    messages.value = (await $fetch<{ messages: DiscordMessage[] }>('/api/admin/discord/messages', {
      query: { channelId: msgChannelId.value },
    })).messages
  })
}
watch(msgChannelId, loadMessages)

/** Loads an existing message back into the composer, turning Send into Save. */
function startEditMessage(m: DiscordMessage) {
  editingId.value = m.id
  draft.value = m.content
  msgEmbeds.value = (m.embeds ?? []).map(embedToDraft)
  msgRows.value = componentsToDraft(m.components)
  composer.value = msgEmbeds.value.length ? 'embeds' : 'text'
  notice.value = ''
}

function resetComposer() {
  draft.value = ''
  msgEmbeds.value = []
  msgRows.value = []
  editingId.value = null
  allowMentions.value = false
  composer.value = 'text'
}

async function submitMessage() {
  if (composerEmpty.value || !msgChannelId.value) return
  await run('send', async () => {
    const payload = {
      channelId: msgChannelId.value,
      content: draft.value.trim(),
      embeds: msgEmbeds.value,
      components: msgRows.value,
    }

    const res = editingId.value
      ? await $fetch<{ unhandled: string[] }>('/api/admin/discord/edit', {
          method: 'PATCH',
          body: { ...payload, messageId: editingId.value },
        })
      : await $fetch<{ unhandled: string[] }>('/api/admin/discord/send', {
          method: 'POST',
          body: { ...payload, allowMentions: allowMentions.value },
        })

    const wasEdit = !!editingId.value
    resetComposer()
    await loadMessages()

    const sent = wasEdit ? 'Message updated.' : `Posted to #${msgChannelName.value}.`
    // The message went out either way — this is the part worth knowing about.
    return res.unhandled?.length
      ? `${sent} Nothing handles ${res.unhandled.join(', ')} yet, so those buttons will fail when pressed.`
      : sent
  })
}

// --- moderation ------------------------------------------------------------
interface Member {
  id: string
  username: string
  displayName: string
  avatar: string | null
  bot: boolean
  joinedAt: string
  mutedUntil: string | null
  spectra: { id: string, username: string | null, mcUsername: string | null, banned: boolean } | null
}
const memberQuery = ref('')
const members = ref<Member[]>([])
const selected = ref<Member | null>(null)
const modReason = ref('')
const muteMinutes = ref(60)
const purgeDays = ref(0)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(memberQuery, (value) => {
  clearTimeout(searchTimer)
  if (value.trim().length < 2) {
    members.value = []
    return
  }
  searchTimer = setTimeout(() => run('search', async () => {
    members.value = (await $fetch<{ members: Member[] }>('/api/admin/discord/members', {
      query: { q: value.trim() },
    })).members
  }), 350)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

async function moderate(action: 'ban' | 'kick' | 'mute' | 'unmute' | 'unban') {
  const target = selected.value
  if (!target) return
  await run(action, async () => {
    await $fetch('/api/admin/discord/moderate', {
      method: 'POST',
      body: {
        action,
        userId: target.id,
        reason: modReason.value,
        minutes: action === 'mute' ? muteMinutes.value : undefined,
        deleteMessageSeconds: action === 'ban' ? purgeDays.value * 86400 : undefined,
      },
    })
    modReason.value = ''
    await loadWarnings()
    return `${action} applied to ${target.displayName}.`
  })
}

interface Warning {
  id: number
  userId: string
  moderatorId: string
  reason: string | null
  created: number
  spectra: string | null
}
const warnings = ref<Warning[]>([])

async function loadWarnings() {
  await run('warnings', async () => {
    warnings.value = (await $fetch<{ warnings: Warning[] }>('/api/admin/discord/warnings')).warnings
  })
}

async function deleteWarning(id: number) {
  await run(`warning-${id}`, async () => {
    await $fetch(`/api/admin/discord/warnings/${id}`, { method: 'DELETE' })
    await loadWarnings()
  })
}

// --- welcome ---------------------------------------------------------------
interface WelcomeConfig {
  enabled: boolean
  channelId: string | null
  messageType: string
  content: string
  embed: Record<string, unknown>
}
const welcomeType = ref<'welcome' | 'farewell'>('welcome')
const welcome = reactive<WelcomeConfig>({
  enabled: false, channelId: '', messageType: 'text', content: '', embed: {},
})
const welcomeVars = ref<string[]>([])
const welcomeEmbed = ref<EmbedDraft>(emptyEmbed())

async function loadWelcome() {
  await run('welcome', async () => {
    const res = await $fetch<{ config: WelcomeConfig, variables: string[] }>(
      `/api/admin/discord/welcome/${welcomeType.value}`)
    Object.assign(welcome, res.config, { channelId: res.config.channelId ?? '' })
    welcomeVars.value = res.variables
    welcomeEmbed.value = embedToDraft(res.config.embed)
  })
}
watch(welcomeType, loadWelcome)

/**
 * The preview substitutes the variables with sample values, because an embed
 * reading "Welcome {mention} to {servername}" tells you nothing about whether
 * the line will fit or how it will wrap.
 */
const SAMPLE_VARS: Record<string, string> = {
  username: 'patryk', displayname: 'Patryk', mention: '@Patryk',
  servername: 'Spectra', membercount: '412', id: '123456789012345678',
  mcname: 'Notch', spectraname: 'makoto',
}
const fillVars = (text: string) =>
  text.replace(/\{(\w+)\}/g, (whole, key) => SAMPLE_VARS[key] ?? whole)

const welcomePreview = computed<EmbedDraft>(() => ({
  ...welcomeEmbed.value,
  title: fillVars(welcomeEmbed.value.title),
  description: fillVars(welcomeEmbed.value.description),
  author: { ...welcomeEmbed.value.author, name: fillVars(welcomeEmbed.value.author.name) },
  footer: { ...welcomeEmbed.value.footer, text: fillVars(welcomeEmbed.value.footer.text) },
  fields: welcomeEmbed.value.fields.map(f => ({
    ...f, name: fillVars(f.name), value: fillVars(f.value),
  })),
}))

async function saveWelcome() {
  await run('save-welcome', async () => {
    await $fetch(`/api/admin/discord/welcome/${welcomeType.value}`, {
      method: 'POST',
      body: {
        enabled: welcome.enabled,
        channelId: welcome.channelId || null,
        messageType: welcome.messageType,
        content: welcome.content,
        embed: welcomeEmbed.value,
      },
    })
    return 'Saved. The bot picks this up on the next join.'
  })
}

// --- tickets ---------------------------------------------------------------
interface Ticket {
  id: number
  channelId: string
  userId: string
  topic: string | null
  status: string
  created: number
  closed: number | null
  closedBy: string | null
  hasTranscript: boolean
  spectra: string | null
}
const ticketFilter = ref<'all' | 'open' | 'closed'>('all')
const tickets = ref<Ticket[]>([])
const openTicket = ref<(Ticket & { transcript: string | null }) | null>(null)

async function loadTickets() {
  await run('tickets', async () => {
    tickets.value = (await $fetch<{ tickets: Ticket[] }>('/api/admin/discord/tickets', {
      query: { status: ticketFilter.value },
    })).tickets
  })
}
watch(ticketFilter, loadTickets)

async function showTicket(id: number) {
  await run(`ticket-${id}`, async () => {
    openTicket.value = (await $fetch<{ ticket: Ticket & { transcript: string | null } }>(
      `/api/admin/discord/tickets/${id}`)).ticket
  })
}

// --- config ----------------------------------------------------------------
interface BotConfig {
  logChannel: string | null
  ticketCategory: string | null
  ticketArchiveCategory: string | null
  ticketPanelChannel: string | null
  ticketPrefix: string
  ticketRoles: string[]
  voiceHub: string | null
  voiceCategory: string | null
  releaseChannel: string | null
}
const config = reactive<BotConfig>({
  logChannel: '', ticketCategory: '', ticketArchiveCategory: '',
  ticketPanelChannel: '', ticketPrefix: 'ticket-', ticketRoles: [],
  voiceHub: '', voiceCategory: '', releaseChannel: '',
})

const voiceChannels = ref<Named[]>([])
const voiceChannelItems = computed(() =>
  [{ label: '— off —', value: '' }, ...voiceChannels.value.map(c => ({ label: `🔊 ${c.name}`, value: c.id }))])
const panelTitle = ref('Need a hand?')
const panelDescription = ref('Press the button below and a private channel will open for you.')

async function loadConfig() {
  await run('config', async () => {
    const res = await $fetch<{
      config: BotConfig
      textChannels: Named[]
      voiceChannels: Named[]
      categories: Named[]
      roles: { id: string, name: string, color: number }[]
    }>('/api/admin/discord/config')
    Object.assign(config, {
      ...res.config,
      // Nulls become empty strings: a USelect bound to null shows no selection
      // at all rather than the "none" option.
      logChannel: res.config.logChannel ?? '',
      ticketCategory: res.config.ticketCategory ?? '',
      ticketArchiveCategory: res.config.ticketArchiveCategory ?? '',
      ticketPanelChannel: res.config.ticketPanelChannel ?? '',
      voiceHub: res.config.voiceHub ?? '',
      voiceCategory: res.config.voiceCategory ?? '',
      releaseChannel: res.config.releaseChannel ?? '',
    })
    textChannels.value = res.textChannels
    voiceChannels.value = res.voiceChannels
    categories.value = res.categories
    roles.value = res.roles
  })
}

async function saveConfig() {
  await run('save-config', async () => {
    await $fetch('/api/admin/discord/config', { method: 'POST', body: { ...config } })
    return 'Configuration saved.'
  })
}

async function postTicketPanel() {
  await run('ticket-panel', async () => {
    await $fetch('/api/admin/discord/ticket-panel', {
      method: 'POST',
      body: {
        channelId: config.ticketPanelChannel,
        title: panelTitle.value,
        description: panelDescription.value,
      },
    })
    return 'Panel posted. The button only works once the bot is running.'
  })
}

// --- loading ---------------------------------------------------------------
// Each pane fetches the first time it is opened; the overview is what loads on
// mount, because that is what the tab shows.
const loaded = new Set<Pane>()
watch(pane, async (to) => {
  if (loaded.has(to)) return
  loaded.add(to)
  if (to === 'messages') { await loadChannels(); await loadEmojis() }
  if (to === 'moderation') await loadWarnings()
  if (to === 'welcome') { await loadConfig(); await loadWelcome(); await loadEmojis() }
  if (to === 'tickets') await loadTickets()
  if (to === 'config') await loadConfig()
})

onMounted(async () => {
  await loadStats()
  loaded.add('overview')
})

defineExpose({ reload: loadStats })

const when = (ms: number) => new Date(ms).toLocaleString()
const whenIso = (iso: string) => new Date(iso).toLocaleString()
const roleName = (id: string) => roles.value.find(r => r.id === id)?.name ?? id
</script>

<template>
  <div class="space-y-4">
    <p v-if="error" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ error }}</p>
    <p v-if="notice" class="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{{ notice }}</p>

    <!-- not configured -->
    <UCard v-if="stats && !stats.configured">
      <template #header><h2 class="font-semibold">Discord is not configured</h2></template>
      <p class="text-sm text-white/60">
        Set <code class="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs">DISCORD_BOT_TOKEN</code> and
        <code class="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs">DISCORD_GUILD_ID</code>
        in the environment and restart. Sending, editing and moderation work with nothing else running.
        Welcomes and tickets additionally need the bot process from the <b>dc-bot</b> repo.
      </p>
    </UCard>

    <template v-else-if="stats?.guild">
      <!-- sub-nav -->
      <div class="flex flex-wrap gap-1">
        <button
          v-for="p in PANES"
          :key="p.id"
          type="button"
          class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition"
          :class="pane === p.id ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white/70'"
          @click="pane = p.id"
        >
          <UIcon :name="p.icon" class="size-4" />{{ p.label }}
        </button>
      </div>

      <!-- overview -->
      <div v-if="pane === 'overview'" class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <UCard v-for="card in [
          { label: 'Members', value: stats.guild.memberCount },
          { label: 'Online', value: stats.guild.onlineCount },
          { label: 'Channels', value: stats.guild.channels },
          { label: 'Open tickets', value: stats.openTickets ?? 0 },
          { label: 'Warnings', value: stats.warnings ?? 0 },
        ]" :key="card.label" :ui="{ body: 'p-4' }">
          <div class="text-2xl font-bold">{{ card.value.toLocaleString() }}</div>
          <div class="mt-1 text-xs text-white/50">{{ card.label }}</div>
        </UCard>
      </div>

      <!-- messages -->
      <div v-else-if="pane === 'messages'" class="space-y-4">
        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ editingId ? 'Edit message' : 'Send a message' }}</h2>
          </template>
          <div class="space-y-3">
            <USelect v-model="msgChannelId" :items="channelItems" placeholder="Pick a channel…" class="w-full max-w-md" />

            <div class="grid gap-4 lg:grid-cols-2">
              <!-- editor -->
              <div class="space-y-3">
                <div class="flex gap-1 rounded-lg bg-white/[0.03] p-1">
                  <button
                    v-for="mode in ([
                      { id: 'text', label: 'Text', badge: draft.length ? String(draft.length) : '' },
                      { id: 'embeds', label: 'Embeds', badge: msgEmbeds.length ? String(msgEmbeds.length) : '' },
                      { id: 'buttons', label: 'Buttons', badge: msgRows.length ? String(msgRows.length) : '' },
                    ] as const)"
                    :key="mode.id"
                    type="button"
                    class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition"
                    :class="composer === mode.id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70'"
                    @click="composer = mode.id"
                  >
                    {{ mode.label }}
                    <span v-if="mode.badge" class="rounded bg-white/10 px-1 text-[10px]">{{ mode.badge }}</span>
                  </button>
                </div>

                <template v-if="composer === 'text'">
                  <UTextarea v-model="draft" :rows="8" :maxlength="2000" placeholder="What should the bot say? Markdown works." class="w-full" />
                  <div class="flex items-center gap-2">
                    <DiscordEmojiPicker :emojis="emojis" />
                    <span class="ms-auto font-mono text-[11px] text-white/35">{{ draft.length }}/2000</span>
                  </div>
                </template>

                <template v-else-if="composer === 'embeds'">
                  <div v-for="(embed, i) in msgEmbeds" :key="i" class="rounded-lg border border-white/8 p-3">
                    <div class="mb-2 flex items-center gap-2">
                      <span class="text-sm font-medium">Embed {{ i + 1 }}</span>
                      <UButton
                        class="ms-auto" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2"
                        @click="msgEmbeds.splice(i, 1)"
                      />
                    </div>
                    <DiscordEmbedBuilder v-model="msgEmbeds[i]!" />
                  </div>

                  <div class="flex items-center gap-3">
                    <UButton
                      size="xs" color="neutral" variant="soft" icon="i-lucide-plus"
                      :label="`Add embed (${msgEmbeds.length}/${MAX_EMBEDS})`"
                      :disabled="msgEmbeds.length >= MAX_EMBEDS"
                      @click="msgEmbeds.push(emptyEmbed())"
                    />
                    <!-- Inserts wherever the caret is, so it works for the
                         description, a field value, the footer — any of them. -->
                    <DiscordEmojiPicker :emojis="emojis" />
                    <!-- The 6000 is a whole-message budget; running past it is
                         the failure people hit last, after everything else fits. -->
                    <span
                      class="ms-auto font-mono text-[11px]"
                      :class="embedCharacters > EMBED_BUDGET ? 'text-red-300' : 'text-white/35'"
                    >{{ embedCharacters }}/{{ EMBED_BUDGET }}</span>
                  </div>
                </template>

                <DiscordComponentsBuilder v-else v-model="msgRows" :emojis="emojis" />
              </div>

              <!-- preview -->
              <div class="space-y-2">
                <p class="text-[11px] uppercase tracking-wide text-white/35">Preview</p>
                <DiscordMessagePreview
                  :content="draft" :embeds="msgEmbeds" :components="msgRows"
                  :bot-name="stats?.bot?.username"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3 border-t border-white/8 pt-3">
              <UButton
                :icon="editingId ? 'i-lucide-save' : 'i-lucide-send'"
                :label="editingId ? 'Save changes' : 'Send'"
                :disabled="composerEmpty || !msgChannelId || embedCharacters > EMBED_BUDGET"
                :loading="busy === 'send'"
                @click="submitMessage"
              />
              <UButton v-if="editingId" color="neutral" variant="ghost" label="Cancel" @click="resetComposer" />
              <!-- Editing never re-pings: Discord notifies on mentions added by
                   an edit, which would surprise a whole channel at once. -->
              <UCheckbox v-if="!editingId" v-model="allowMentions" label="Allow @everyone and role pings" />
            </div>
          </div>
        </UCard>

        <UCard v-if="msgChannelId" :ui="{ body: 'p-0' }">
          <template #header><h2 class="font-semibold">Bot messages in #{{ msgChannelName }}</h2></template>
          <p v-if="!messages.length" class="p-6 text-sm text-white/40">
            Nothing the bot posted in the last 50 messages here. Discord only allows editing its own.
          </p>
          <ul v-else class="divide-y divide-white/6">
            <li v-for="m in messages" :key="m.id" class="flex items-start gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="whitespace-pre-wrap break-words text-sm">{{ m.content || '(embed only)' }}</p>
                <p class="mt-1 text-[11px] text-white/35">
                  {{ whenIso(m.timestamp) }}<span v-if="m.editedAt"> · edited</span>
                  <span v-if="m.embeds.length"> · {{ m.embeds.length }} embed(s)</span>
                  <span v-if="m.components.length"> · {{ m.components.length }} button row(s)</span>
                </p>
              </div>
              <!-- Loads the whole message back into the builder now, embeds and
                   buttons included, so an embed-only message is editable too. -->
              <UButton
                size="xs" color="neutral" variant="soft" icon="i-lucide-pencil"
                @click="startEditMessage(m)"
              />
            </li>
          </ul>
        </UCard>
      </div>

      <!-- moderation -->
      <div v-else-if="pane === 'moderation'" class="space-y-4">
        <UCard>
          <template #header><h2 class="font-semibold">Find a member</h2></template>
          <UInput v-model="memberQuery" icon="i-lucide-search" placeholder="Username or nickname…" class="w-full max-w-md" />

          <ul v-if="members.length" class="mt-3 divide-y divide-white/6 rounded-lg bg-white/[0.02]">
            <li
              v-for="m in members" :key="m.id"
              class="flex cursor-pointer items-center gap-3 p-2.5 transition hover:bg-white/5"
              :class="selected?.id === m.id && 'bg-white/[0.07]'"
              @click="selected = m"
            >
              <img
                v-if="m.avatar"
                :src="`https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=32`"
                alt="" class="size-8 rounded-full"
              >
              <span v-else class="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs">?</span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">
                  {{ m.displayName }}
                  <span class="text-white/35">@{{ m.username }}</span>
                </div>
                <!-- The whole point of joining `account`: a snowflake becomes a
                     person you can recognise from the rest of the panel. -->
                <div class="truncate text-[11px] text-white/40">
                  <span v-if="m.spectra">
                    Spectra: @{{ m.spectra.username }}
                    <span v-if="m.spectra.mcUsername"> · MC: {{ m.spectra.mcUsername }}</span>
                    <span v-if="m.spectra.banned" class="text-red-300"> · site-banned</span>
                  </span>
                  <span v-else>no linked Spectra account</span>
                </div>
              </div>
              <UIcon v-if="m.mutedUntil" name="i-lucide-volume-x" class="size-4 text-amber-300" title="Currently muted" />
            </li>
          </ul>
        </UCard>

        <UCard v-if="selected">
          <template #header><h2 class="font-semibold">Act on {{ selected.displayName }}</h2></template>
          <div class="space-y-3">
            <UInput v-model="modReason" placeholder="Reason (shown in the audit log)" class="w-full" />
            <div class="flex flex-wrap items-end gap-3">
              <div>
                <label class="mb-1 block text-[11px] text-white/40">Mute minutes</label>
                <UInput v-model.number="muteMinutes" type="number" :min="1" :max="40320" class="w-28" />
              </div>
              <div>
                <label class="mb-1 block text-[11px] text-white/40">Ban: purge days</label>
                <UInput v-model.number="purgeDays" type="number" :min="0" :max="7" class="w-28" />
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton color="warning" variant="soft" icon="i-lucide-volume-x" label="Mute" :loading="busy === 'mute'" @click="moderate('mute')" />
              <UButton color="success" variant="soft" icon="i-lucide-volume-2" label="Unmute" :loading="busy === 'unmute'" @click="moderate('unmute')" />
              <UButton color="warning" icon="i-lucide-user-minus" label="Kick" :loading="busy === 'kick'" @click="moderate('kick')" />
              <UButton color="error" icon="i-lucide-hammer" label="Ban" :loading="busy === 'ban'" @click="moderate('ban')" />
              <UButton color="neutral" variant="soft" icon="i-lucide-undo-2" label="Unban" :loading="busy === 'unban'" @click="moderate('unban')" />
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-0' }">
          <template #header><h2 class="font-semibold">Warnings</h2></template>
          <p v-if="!warnings.length" class="p-6 text-sm text-white/40">
            None yet. These are written by the bot's <code class="font-mono">/warn</code> command and by bans issued here.
          </p>
          <ul v-else class="divide-y divide-white/6">
            <li v-for="w in warnings" :key="w.id" class="flex items-start gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm">{{ w.reason || 'No reason given' }}</p>
                <p class="mt-1 text-[11px] text-white/35">
                  <span v-if="w.spectra">@{{ w.spectra }}</span><span v-else>{{ w.userId }}</span>
                  · by {{ w.moderatorId }} · {{ when(w.created) }}
                </p>
              </div>
              <UButton
                size="xs" color="error" variant="ghost" icon="i-lucide-trash-2"
                :loading="busy === `warning-${w.id}`" @click="deleteWarning(w.id)"
              />
            </li>
          </ul>
        </UCard>
      </div>

      <!-- welcome -->
      <div v-else-if="pane === 'welcome'" class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold">Automatic messages</h2>
              <USelect
                v-model="welcomeType"
                :items="[{ label: 'On join', value: 'welcome' }, { label: 'On leave', value: 'farewell' }]"
                class="w-40"
              />
            </div>
          </template>

          <div class="space-y-3">
            <UCheckbox v-model="welcome.enabled" label="Enabled" />
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Channel</label>
              <USelect v-model="welcome.channelId" :items="textChannelItems" class="w-full max-w-md" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Format</label>
              <USelect
                v-model="welcome.messageType"
                :items="[{ label: 'Plain text', value: 'text' }, { label: 'Embed', value: 'embed' }]"
                class="w-40"
              />
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <div class="space-y-2">
                <UTextarea
                  v-if="welcome.messageType === 'text'"
                  v-model="welcome.content" :rows="6" :maxlength="2000" class="w-full"
                  placeholder="Welcome {mention} to {servername}!"
                />
                <DiscordEmbedBuilder v-else v-model="welcomeEmbed" />
                <DiscordEmojiPicker :emojis="emojis" />
              </div>

              <div class="space-y-2">
                <p class="text-[11px] uppercase tracking-wide text-white/35">
                  Preview — with sample values
                </p>
                <DiscordMessagePreview
                  :content="welcome.messageType === 'text' ? fillVars(welcome.content) : ''"
                  :embeds="welcome.messageType === 'embed' ? [welcomePreview] : []"
                  :components="[]"
                  :bot-name="stats?.bot?.username"
                />
              </div>
            </div>

            <p class="text-[11px] text-white/40">
              Substituted by the bot when it sends:
              <button
                v-for="v in welcomeVars" :key="v" type="button"
                class="me-1 rounded bg-white/8 px-1 py-0.5 font-mono transition hover:bg-white/15 hover:text-white"
                title="Append to the text"
                @click="welcome.messageType === 'text'
                  ? welcome.content += v
                  : welcomeEmbed.description += v"
              >{{ v }}</button>
            </p>

            <UButton
              icon="i-lucide-save" label="Save"
              :loading="busy === 'save-welcome'"
              @click="saveWelcome"
            />
            <p class="text-[11px] text-white/35">
              Saving only stores the message. Sending it happens on a gateway event, which is the bot's job —
              nothing will be posted until dc-bot is running.
            </p>
          </div>
        </UCard>
      </div>

      <!-- tickets -->
      <div v-else-if="pane === 'tickets'" class="space-y-4">
        <div class="flex items-center gap-3">
          <USelect
            v-model="ticketFilter"
            :items="[{ label: 'All', value: 'all' }, { label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }]"
            class="w-36"
          />
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" label="Reload" @click="loadTickets" />
        </div>

        <UCard :ui="{ body: 'p-0' }">
          <p v-if="!tickets.length" class="p-6 text-sm text-white/40">
            No tickets. They appear here once the bot creates them.
          </p>
          <ul v-else class="divide-y divide-white/6">
            <li v-for="t in tickets" :key="t.id" class="flex items-center gap-3 p-3">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                :class="t.status === 'open' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/8 text-white/45'"
              >{{ t.status }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">#{{ t.id }} · {{ t.topic || 'No topic' }}</p>
                <p class="text-[11px] text-white/35">
                  <span v-if="t.spectra">@{{ t.spectra }}</span><span v-else>{{ t.userId }}</span>
                  · opened {{ when(t.created) }}
                  <span v-if="t.closed"> · closed {{ when(t.closed) }}</span>
                </p>
              </div>
              <UButton
                size="xs" color="neutral" variant="soft" icon="i-lucide-file-text"
                :disabled="!t.hasTranscript" :title="t.hasTranscript ? 'Read the transcript' : 'No transcript — still open'"
                :loading="busy === `ticket-${t.id}`" @click="showTicket(t.id)"
              />
            </li>
          </ul>
        </UCard>

        <UCard v-if="openTicket?.transcript">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold">Transcript · ticket #{{ openTicket.id }}</h2>
              <UButton color="neutral" variant="ghost" size="xs" label="Close" @click="openTicket = null" />
            </div>
          </template>
          <!-- The transcript is Discord messages turned into markup, i.e. text
               other people wrote. `sandbox` with nothing granted means it can
               neither run scripts nor reach this origin. -->
          <iframe
            :srcdoc="openTicket.transcript"
            sandbox=""
            class="h-[32rem] w-full rounded-lg border border-white/10 bg-white"
            title="Ticket transcript"
          />
        </UCard>
      </div>

      <!-- config -->
      <div v-else-if="pane === 'config'" class="space-y-4">
        <UCard>
          <template #header><h2 class="font-semibold">Bot configuration</h2></template>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Mod-log channel</label>
              <USelect v-model="config.logChannel" :items="textChannelItems" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Ticket category</label>
              <USelect v-model="config.ticketCategory" :items="categoryItems" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Ticket archive category</label>
              <USelect v-model="config.ticketArchiveCategory" :items="categoryItems" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Ticket channel prefix</label>
              <UInput v-model="config.ticketPrefix" class="w-full" placeholder="ticket-" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Launcher releases</label>
              <USelect v-model="config.releaseChannel" :items="textChannelItems" class="w-full" />
              <p class="mt-1 text-[11px] text-white/30">
                Where a new launcher version is announced. Off means nothing is posted.
              </p>
            </div>
          </div>

          <div class="mt-4">
            <label class="mb-1.5 block text-[11px] text-white/40">Support roles — these see every ticket and get pinged</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="r in roles" :key="r.id" type="button"
                class="rounded-lg border px-2.5 py-1 text-xs transition"
                :class="config.ticketRoles.includes(r.id)
                  ? 'border-primary-400/50 bg-primary-400/15 text-white'
                  : 'border-white/10 text-white/45 hover:text-white/70'"
                @click="config.ticketRoles.includes(r.id)
                  ? config.ticketRoles.splice(config.ticketRoles.indexOf(r.id), 1)
                  : config.ticketRoles.push(r.id)"
              >{{ r.name }}</button>
            </div>
          </div>

          <UButton class="mt-4" icon="i-lucide-save" label="Save configuration" :loading="busy === 'save-config'" @click="saveConfig" />
        </UCard>

        <UCard>
          <template #header><h2 class="font-semibold">Temporary voice channels</h2></template>
          <p class="mb-3 text-sm text-white/50">
            Joining the hub gives someone a voice channel of their own and moves them into it.
            It disappears when the last person leaves. Nobody ever stays in the hub itself —
            make it an empty channel called something like “➕ New channel”.
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Hub channel</label>
              <USelect v-model="config.voiceHub" :items="voiceChannelItems" class="w-full" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Create them in</label>
              <USelect v-model="config.voiceCategory" :items="categoryItems" class="w-full" />
              <p class="mt-1 text-[11px] text-white/30">Leave empty to use the hub's own category.</p>
            </div>
          </div>
          <p class="mt-3 text-[11px] text-white/35">
            Handled by the bot, so it needs dc-bot running with <b>Manage Channels</b> and
            <b>Move Members</b>. Owners get <code class="rounded bg-white/8 px-1 font-mono">/vc rename</code>,
            <code class="rounded bg-white/8 px-1 font-mono">limit</code>,
            <code class="rounded bg-white/8 px-1 font-mono">lock</code>,
            <code class="rounded bg-white/8 px-1 font-mono">unlock</code> and
            <code class="rounded bg-white/8 px-1 font-mono">kick</code> for their own channel.
          </p>
          <UButton class="mt-4" icon="i-lucide-save" label="Save configuration" :loading="busy === 'save-config'" @click="saveConfig" />
        </UCard>

        <UCard>
          <template #header><h2 class="font-semibold">Ticket panel</h2></template>
          <p class="mb-3 text-sm text-white/50">
            Posts the message with the “open a ticket” button. Pressing it is handled by the bot,
            so the button does nothing until dc-bot is running.
          </p>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-[11px] text-white/40">Post into</label>
              <USelect v-model="config.ticketPanelChannel" :items="textChannelItems" class="w-full max-w-md" />
            </div>
            <UInput v-model="panelTitle" class="w-full max-w-md" placeholder="Title" />
            <UTextarea v-model="panelDescription" :rows="3" class="w-full" placeholder="Description" />
            <UButton
              icon="i-lucide-send" label="Post the panel"
              :disabled="!config.ticketPanelChannel" :loading="busy === 'ticket-panel'"
              @click="postTicketPanel"
            />
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
