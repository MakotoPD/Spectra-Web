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

// --- messages --------------------------------------------------------------
interface DiscordMessage {
  id: string
  content: string
  embeds: unknown[]
  hasComponents: boolean
  timestamp: string
  editedAt: string | null
}
const msgChannelId = ref('')
const messages = ref<DiscordMessage[]>([])
const draft = ref('')
const allowMentions = ref(false)
const editingId = ref<string | null>(null)

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

function startEditMessage(m: DiscordMessage) {
  editingId.value = m.id
  draft.value = m.content
  notice.value = ''
}

async function submitMessage() {
  const content = draft.value.trim()
  if (!content || !msgChannelId.value) return
  await run('send', async () => {
    if (editingId.value) {
      await $fetch('/api/admin/discord/edit', {
        method: 'PATCH',
        body: { channelId: msgChannelId.value, messageId: editingId.value, content },
      })
    } else {
      await $fetch('/api/admin/discord/send', {
        method: 'POST',
        body: { channelId: msgChannelId.value, content, allowMentions: allowMentions.value },
      })
    }
    const wasEdit = !!editingId.value
    draft.value = ''
    editingId.value = null
    allowMentions.value = false
    await loadMessages()
    return wasEdit ? 'Message updated.' : `Posted to #${msgChannelName.value}.`
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
const embedText = ref('{}')
const embedError = ref('')

async function loadWelcome() {
  await run('welcome', async () => {
    const res = await $fetch<{ config: WelcomeConfig, variables: string[] }>(
      `/api/admin/discord/welcome/${welcomeType.value}`)
    Object.assign(welcome, res.config, { channelId: res.config.channelId ?? '' })
    welcomeVars.value = res.variables
    embedText.value = JSON.stringify(res.config.embed ?? {}, null, 2)
    embedError.value = ''
  })
}
watch(welcomeType, loadWelcome)

// Parsed on every keystroke so a broken embed is caught while typing rather
// than by the save button.
watch(embedText, (value) => {
  try {
    JSON.parse(value || '{}')
    embedError.value = ''
  } catch (e) {
    embedError.value = (e as Error).message
  }
})

async function saveWelcome() {
  if (embedError.value) return
  await run('save-welcome', async () => {
    await $fetch(`/api/admin/discord/welcome/${welcomeType.value}`, {
      method: 'POST',
      body: {
        enabled: welcome.enabled,
        channelId: welcome.channelId || null,
        messageType: welcome.messageType,
        content: welcome.content,
        embed: JSON.parse(embedText.value || '{}'),
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
}
const config = reactive<BotConfig>({
  logChannel: '', ticketCategory: '', ticketArchiveCategory: '',
  ticketPanelChannel: '', ticketPrefix: 'ticket-', ticketRoles: [],
})
const panelTitle = ref('Need a hand?')
const panelDescription = ref('Press the button below and a private channel will open for you.')

async function loadConfig() {
  await run('config', async () => {
    const res = await $fetch<{
      config: BotConfig
      textChannels: Named[]
      categories: Named[]
      roles: { id: string, name: string, color: number }[]
    }>('/api/admin/discord/config')
    Object.assign(config, {
      ...res.config,
      logChannel: res.config.logChannel ?? '',
      ticketCategory: res.config.ticketCategory ?? '',
      ticketArchiveCategory: res.config.ticketArchiveCategory ?? '',
      ticketPanelChannel: res.config.ticketPanelChannel ?? '',
    })
    textChannels.value = res.textChannels
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
  if (to === 'messages') await loadChannels()
  if (to === 'moderation') await loadWarnings()
  if (to === 'welcome') { await loadConfig(); await loadWelcome() }
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
            <UTextarea v-model="draft" :rows="5" :maxlength="2000" placeholder="What should the bot say?" class="w-full" />
            <div class="flex flex-wrap items-center gap-3">
              <UButton
                :icon="editingId ? 'i-lucide-save' : 'i-lucide-send'"
                :label="editingId ? 'Save changes' : 'Send'"
                :disabled="!draft.trim() || !msgChannelId"
                :loading="busy === 'send'"
                @click="submitMessage"
              />
              <UButton v-if="editingId" color="neutral" variant="ghost" label="Cancel" @click="editingId = null; draft = ''" />
              <!-- Editing never re-pings: Discord notifies on mentions added by
                   an edit, which would surprise a whole channel at once. -->
              <UCheckbox v-if="!editingId" v-model="allowMentions" label="Allow @everyone and role pings" />
              <span class="ms-auto font-mono text-xs text-white/35">{{ draft.length }}/2000</span>
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
                  <span v-if="m.hasComponents"> · has buttons</span>
                </p>
              </div>
              <UButton
                size="xs" color="neutral" variant="soft" icon="i-lucide-pencil"
                :disabled="!m.content" @click="startEditMessage(m)"
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

            <template v-if="welcome.messageType === 'text'">
              <UTextarea v-model="welcome.content" :rows="4" :maxlength="2000" class="w-full" placeholder="Welcome {mention} to {servername}!" />
            </template>
            <template v-else>
              <label class="mb-1 block text-[11px] text-white/40">Embed JSON</label>
              <UTextarea v-model="embedText" :rows="12" class="w-full font-mono text-xs" />
              <p v-if="embedError" class="text-xs text-red-300">{{ embedError }}</p>
            </template>

            <p class="text-[11px] text-white/40">
              Substituted by the bot when it sends:
              <code v-for="v in welcomeVars" :key="v" class="me-1 rounded bg-white/8 px-1 py-0.5 font-mono">{{ v }}</code>
            </p>

            <UButton
              icon="i-lucide-save" label="Save"
              :disabled="!!embedError" :loading="busy === 'save-welcome'"
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
