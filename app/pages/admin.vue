<script setup lang="ts">
// Internal telemetry dashboard. Gated by the ADMIN_TOKEN cookie (see
// server/api/admin/*). Not linked anywhere public.

interface Bucket { label: string; value: number }
interface ShareRow {
  code: string
  name: string | null
  mc_version: string | null
  loader: string | null
  mods: number
  size: number
  downloads: number
  created: number
  expires: number
}
interface ShareStats {
  overview: { created30: number; active: number; downloads30: number; storedBytes: number }
  series: Bucket[]
  recent: ShareRow[]
  loaders: Bucket[]
}
interface Stats {
  generatedAt: number
  overview: {
    totalInstalls: number
    dau: number
    wau: number
    mau: number
    launches30: number
    crashes30: number
  }
  activeSeries: Bucket[]
  versions: Bucket[]
  os: Bucket[]
  locales: Bucket[]
  loaders: Bucket[]
  mcVersions: Bucket[]
  features: Bucket[]
  shares: ShareStats | null
}

useHead({ title: 'Spectra · Telemetry' })

const authed = ref(false)
const checking = ref(true)
const token = ref('')
const loginError = ref('')
const serverError = ref('')
const stats = ref<Stats | null>(null)

async function loadStats() {
  serverError.value = ''
  try {
    stats.value = await $fetch<Stats>('/api/admin/stats')
    authed.value = true
  } catch (e) {
    const err = e as { statusCode?: number, statusMessage?: string, data?: { message?: string } }
    if (err?.statusCode === 401) {
      authed.value = false
    } else {
      // Logged in, but the stats endpoint failed (e.g. DB issue) — show it.
      authed.value = true
      serverError.value = err?.data?.message || err?.statusMessage || 'Server error'
    }
  } finally {
    checking.value = false
  }
}

async function login() {
  loginError.value = ''
  try {
    await $fetch('/api/admin/login', { method: 'POST', body: { token: token.value } })
    token.value = ''
    await loadStats()
  } catch {
    loginError.value = 'Invalid token'
  }
}

async function logout() {
  await $fetch('/api/admin/logout', { method: 'POST' })
  authed.value = false
  stats.value = null
  // Account rows are the most sensitive thing this page holds — they do not
  // stay in memory behind a signed-out screen.
  users.value = []
}

onMounted(loadStats)

// --- users -----------------------------------------------------------------
// Accounts, not telemetry: this half talks to /api/admin/users and is the only
// place display names, usernames and ban state can be changed by hand.
interface AdminUser {
  id: string
  name: string | null
  username: string | null
  email: string
  image: string | null
  emailVerified: boolean
  banned: boolean
  mcUsername: string | null
  createdAt: number
  lastSeen: number | null
  friends: number
  shares: number
}

const tab = ref<'telemetry' | 'users' | 'discord'>('telemetry')
const users = ref<AdminUser[]>([])
const usersTotal = ref(0)
const userSearch = ref('')
const usersLoading = ref(false)
const usersError = ref('')
/** Id of the row with a request in flight, so only its buttons go quiet. */
const rowBusy = ref('')
const editing = ref<string | null>(null)
const draft = reactive({ name: '', username: '' })
/** Deleting an account cannot be undone, so the button asks twice. */
const confirmDelete = ref<string | null>(null)

function failed(e: unknown, fallback: string) {
  const err = e as { statusCode?: number, statusMessage?: string, data?: { message?: string } }
  // The session can expire while the panel is open; say so rather than
  // reporting it as a broken endpoint.
  if (err?.statusCode === 401) {
    authed.value = false
    return ''
  }
  return err?.data?.message || err?.statusMessage || fallback
}

async function loadUsers() {
  usersLoading.value = true
  usersError.value = ''
  try {
    const res = await $fetch<{ total: number, users: AdminUser[] }>('/api/admin/users', {
      query: { q: userSearch.value },
    })
    users.value = res.users
    usersTotal.value = res.total
  } catch (e) {
    usersError.value = failed(e, 'Could not load users')
  } finally {
    usersLoading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(userSearch, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadUsers, 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

// Fetched when the tab is first opened rather than on load — most visits here
// are for the charts.
const discordPanel = ref<{ reload: () => void } | null>(null)
/** Mounts the Discord panel on first open, then keeps it mounted (v-show). */
const discordOpened = ref(false)

watch(tab, (to) => {
  if (to === 'users' && !users.value.length) loadUsers()
  if (to === 'discord') discordOpened.value = true
})

function startEdit(u: AdminUser) {
  editing.value = u.id
  draft.name = u.name ?? ''
  draft.username = u.username ?? ''
}

async function patchUser(id: string, body: Record<string, unknown>) {
  rowBusy.value = id
  usersError.value = ''
  try {
    await $fetch(`/api/admin/users/${id}`, { method: 'PATCH', body })
    await loadUsers()
    return true
  } catch (e) {
    // A taken username or a malformed one lands here with the reason attached.
    usersError.value = failed(e, 'Could not save the changes')
    return false
  } finally {
    rowBusy.value = ''
  }
}

async function saveEdit(id: string) {
  if (await patchUser(id, { name: draft.name, username: draft.username })) editing.value = null
}

async function removeUser(id: string) {
  rowBusy.value = id
  usersError.value = ''
  try {
    await $fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    confirmDelete.value = null
    await loadUsers()
  } catch (e) {
    usersError.value = failed(e, 'Could not delete the account')
  } finally {
    rowBusy.value = ''
  }
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString()

// --- test accounts ---------------------------------------------------------
// Wiping every @example.com signup in one click. Two steps, and the first one
// says how many there are: a bulk delete that does not tell you what it is
// about to remove is a bulk delete nobody should press.
const TEST_DOMAIN = '@example.com'
/** null = not asked yet. A number = asked, and this many are waiting. */
const purgeCount = ref<number | null>(null)
const purgeCapped = ref(false)
const purging = ref(false)

async function countTestAccounts() {
  purging.value = true
  usersError.value = ''
  try {
    const res = await $fetch<{ users: AdminUser[] }>('/api/admin/users', {
      query: { q: TEST_DOMAIN, limit: 500 },
    })
    // The search matches the term anywhere, including in a display name, so the
    // count is taken from the address itself — the same suffix rule the server
    // deletes by.
    const matches = res.users.filter(u => u.email.toLowerCase().endsWith(TEST_DOMAIN))
    purgeCount.value = matches.length
    // The listing is capped, so a full page means "at least this many".
    purgeCapped.value = res.users.length >= 500
  } catch (e) {
    usersError.value = failed(e, 'Could not count the test accounts')
  } finally {
    purging.value = false
  }
}


async function purgeTestAccounts() {
  purging.value = true
  usersError.value = ''
  try {
    const res = await $fetch<{ deleted: number, failed: string[] }>('/api/admin/test-accounts', {
      method: 'DELETE',
    })
    if (res.failed.length) usersError.value = `Could not delete: ${res.failed.join(', ')}`
    purgeCount.value = null
    await loadUsers()
  } catch (e) {
    usersError.value = failed(e, 'Could not delete the test accounts')
  } finally {
    purging.value = false
  }
}

const maxActive = computed(() => Math.max(1, ...(stats.value?.activeSeries.map(d => d.value) ?? [0])))
function pct(value: number, list: Bucket[]) {
  const max = Math.max(1, ...list.map(b => b.value))
  return Math.round((value / max) * 100)
}
const shortDay = (d: string) => d.slice(5) // MM-DD

const maxShares = computed(() => Math.max(1, ...(stats.value?.shares?.series.map(d => d.value) ?? [0])))
function bytes(n: number) {
  if (!n) return '0 B'
  const kb = n / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}
/** Days left, or "expired" for codes whose blob has already been dropped. */
function expiryLabel(expires: number) {
  const days = Math.ceil((expires - Date.now()) / 86_400_000)
  return days > 0 ? `${days}d` : 'expired'
}
</script>

<template>
  <section class="mx-auto max-w-6xl px-4 pt-28 pb-20">
    <!-- login -->
    <div v-if="!authed" class="mx-auto max-w-sm">
      <UCard>
        <template #header>
          <h1 class="text-lg font-semibold">Telemetry · Admin</h1>
        </template>
        <form class="space-y-3" @submit.prevent="login">
          <UFormField label="Admin token">
            <UInput v-model="token" type="password" placeholder="••••••••" class="w-full" autofocus />
          </UFormField>
          <p v-if="loginError" class="text-sm text-red-400">{{ loginError }}</p>
          <UButton type="submit" block :loading="checking" label="Sign in" />
        </form>
      </UCard>
    </div>

    <!-- logged in, but stats failed (surfaces the real server error) -->
    <div v-else-if="serverError" class="mx-auto max-w-lg">
      <UCard>
        <template #header><h1 class="text-lg font-semibold text-red-400">Stats failed to load</h1></template>
        <p class="wrap-break-word font-mono text-sm text-white/70">{{ serverError }}</p>
        <div class="mt-4 flex gap-2">
          <UButton icon="i-lucide-refresh-cw" label="Retry" @click="loadStats" />
          <UButton color="neutral" variant="soft" icon="i-lucide-log-out" label="Sign out" @click="logout" />
        </div>
      </UCard>
    </div>

    <!-- dashboard -->
    <div v-else-if="stats" class="space-y-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">
            {{ tab === 'users' ? 'Users' : tab === 'discord' ? 'Discord' : 'Telemetry' }}
          </h1>
          <p v-if="tab === 'telemetry'" class="text-sm text-white/50">Last 30 days · updated {{ new Date(stats.generatedAt).toLocaleString() }}</p>
          <p v-else-if="tab === 'users'" class="text-sm text-white/50">{{ usersTotal.toLocaleString() }} accounts</p>
          <p v-else class="text-sm text-white/50">Server, messages, moderation and tickets</p>
        </div>
        <div class="flex gap-2">
          <UButton
            color="neutral" variant="ghost" icon="i-lucide-refresh-cw" label="Refresh"
            :loading="tab === 'users' && usersLoading"
            @click="tab === 'users' ? loadUsers() : tab === 'discord' ? discordPanel?.reload() : loadStats()"
          />
          <UButton color="neutral" variant="soft" icon="i-lucide-log-out" label="Sign out" @click="logout" />
        </div>
      </div>

      <div class="flex gap-1 border-b border-white/8">
        <button
          v-for="t in ([
            { id: 'telemetry', label: 'Telemetry', icon: 'i-lucide-chart-line' },
            { id: 'users', label: 'Users', icon: 'i-lucide-users' },
            { id: 'discord', label: 'Discord', icon: 'i-simple-icons-discord' },
          ] as const)"
          :key="t.id"
          type="button"
          class="-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition"
          :class="tab === t.id
            ? 'border-primary-400 text-white'
            : 'border-transparent text-white/45 hover:text-white/70'"
          @click="tab = t.id"
        >
          <UIcon :name="t.icon" class="size-4" />{{ t.label }}
        </button>
      </div>

      <div v-show="tab === 'telemetry'" class="space-y-8">
        <!-- overview cards -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <UCard v-for="card in [
          { label: 'Installs (all time)', value: stats.overview.totalInstalls },
          { label: 'DAU', value: stats.overview.dau },
          { label: 'WAU', value: stats.overview.wau },
          { label: 'MAU', value: stats.overview.mau },
          { label: 'Launches (30d)', value: stats.overview.launches30 },
          { label: 'Crashes (30d)', value: stats.overview.crashes30 },
        ]" :key="card.label" :ui="{ body: 'p-4' }">
          <div class="text-2xl font-bold">{{ card.value.toLocaleString() }}</div>
          <div class="mt-1 text-xs text-white/50">{{ card.label }}</div>
        </UCard>
      </div>

      <!-- daily active installs -->
      <UCard>
        <template #header><h2 class="font-semibold">Daily active installs</h2></template>
        <div class="flex h-40 items-end gap-1">
          <div
            v-for="d in stats.activeSeries"
            :key="d.label"
            class="group relative flex-1 rounded-t bg-primary-500/70 transition hover:bg-primary-400"
            :style="{ height: Math.max(2, (d.value / maxActive) * 100) + '%' }"
            :title="`${d.label}: ${d.value}`"
          >
            <span class="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1 text-[10px] opacity-0 transition group-hover:opacity-100">{{ d.value }}</span>
          </div>
        </div>
        <div class="mt-2 flex justify-between text-[10px] text-white/40">
          <span>{{ shortDay(stats.activeSeries[0]?.label ?? '') }}</span>
          <span>{{ shortDay(stats.activeSeries.at(-1)?.label ?? '') }}</span>
        </div>
      </UCard>

      <!-- breakdowns -->
      <div class="grid gap-4 md:grid-cols-2">
        <UCard v-for="block in [
          { title: 'Launcher version', data: stats.versions },
          { title: 'OS', data: stats.os },
          { title: 'Mod loader (launches)', data: stats.loaders },
          { title: 'Minecraft version (launches)', data: stats.mcVersions },
          { title: 'Language', data: stats.locales },
          { title: 'Feature usage', data: stats.features },
        ]" :key="block.title">
          <template #header><h2 class="font-semibold">{{ block.title }}</h2></template>
          <p v-if="!block.data.length" class="text-sm text-white/40">No data yet.</p>
          <ul v-else class="space-y-2">
            <li v-for="b in block.data" :key="b.label" class="flex items-center gap-3">
              <span class="w-32 shrink-0 truncate text-sm" :title="b.label">{{ b.label }}</span>
              <span class="relative h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                <span class="absolute inset-y-0 left-0 rounded-full bg-primary-500" :style="{ width: pct(b.value, block.data) + '%' }" />
              </span>
              <span class="w-10 shrink-0 text-right font-mono text-xs text-white/60">{{ b.value }}</span>
            </li>
          </ul>
        </UCard>
      </div>

      <!-- instance sharing -->
      <div v-if="stats.shares" class="space-y-4">
        <h2 class="text-lg font-bold tracking-tight">Instance sharing</h2>

        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <UCard v-for="card in [
            { label: 'Codes created (30d)', value: stats.shares.overview.created30.toLocaleString() },
            { label: 'Live codes', value: stats.shares.overview.active.toLocaleString() },
            { label: 'Redeems (30d)', value: stats.shares.overview.downloads30.toLocaleString() },
            { label: 'Stored packs', value: bytes(stats.shares.overview.storedBytes) },
          ]" :key="card.label" :ui="{ body: 'p-4' }">
            <div class="text-2xl font-bold">{{ card.value }}</div>
            <div class="mt-1 text-xs text-white/50">{{ card.label }}</div>
          </UCard>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <UCard>
            <template #header><h3 class="font-semibold">Codes created per day</h3></template>
            <div class="flex h-32 items-end gap-1">
              <div
                v-for="d in stats.shares.series"
                :key="d.label"
                class="flex-1 rounded-t bg-primary-500/70 transition hover:bg-primary-400"
                :style="{ height: Math.max(2, (d.value / maxShares) * 100) + '%' }"
                :title="`${d.label}: ${d.value}`"
              />
            </div>
            <div class="mt-2 flex justify-between text-[10px] text-white/40">
              <span>{{ shortDay(stats.shares.series[0]?.label ?? '') }}</span>
              <span>{{ shortDay(stats.shares.series.at(-1)?.label ?? '') }}</span>
            </div>
          </UCard>

          <UCard>
            <template #header><h3 class="font-semibold">Shared loaders (30d)</h3></template>
            <p v-if="!stats.shares.loaders.length" class="text-sm text-white/40">No data yet.</p>
            <ul v-else class="space-y-2">
              <li v-for="b in stats.shares.loaders" :key="b.label" class="flex items-center gap-3">
                <span class="w-24 shrink-0 truncate text-sm capitalize">{{ b.label }}</span>
                <span class="relative h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                  <span class="absolute inset-y-0 left-0 rounded-full bg-primary-500" :style="{ width: pct(b.value, stats.shares.loaders) + '%' }" />
                </span>
                <span class="w-10 shrink-0 text-right font-mono text-xs text-white/60">{{ b.value }}</span>
              </li>
            </ul>
          </UCard>
        </div>

        <UCard>
          <template #header><h3 class="font-semibold">Latest codes</h3></template>
          <p v-if="!stats.shares.recent.length" class="text-sm text-white/40">Nobody has shared an instance yet.</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-white/40">
                <tr>
                  <th class="pb-2 pr-3 font-medium">Code</th>
                  <th class="pb-2 pr-3 font-medium">Name</th>
                  <th class="pb-2 pr-3 font-medium">Version</th>
                  <th class="pb-2 pr-3 text-right font-medium">Mods</th>
                  <th class="pb-2 pr-3 text-right font-medium">Size</th>
                  <th class="pb-2 pr-3 text-right font-medium">Redeems</th>
                  <th class="pb-2 text-right font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in stats.shares.recent" :key="row.code" class="border-t border-white/6">
                  <td class="py-2 pr-3 font-mono text-xs">{{ row.code }}</td>
                  <td class="max-w-56 truncate py-2 pr-3" :title="row.name ?? ''">{{ row.name }}</td>
                  <td class="py-2 pr-3 text-xs text-white/60">{{ row.mc_version }} <span class="capitalize">{{ row.loader }}</span></td>
                  <td class="py-2 pr-3 text-right font-mono text-xs">{{ row.mods }}</td>
                  <td class="py-2 pr-3 text-right font-mono text-xs">{{ bytes(row.size) }}</td>
                  <td class="py-2 pr-3 text-right font-mono text-xs">{{ row.downloads }}</td>
                  <td class="py-2 text-right font-mono text-xs text-white/50">{{ expiryLabel(row.expires) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
        </div>
      </div>

      <!-- users -->
      <div v-show="tab === 'users'" class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="userSearch"
            icon="i-lucide-search"
            placeholder="Search name, username, e-mail or MC name…"
            class="w-full max-w-md"
          />
          <span v-if="users.length" class="text-xs text-white/40">showing {{ users.length }}</span>

          <div class="ms-auto flex items-center gap-2">
            <UButton
              v-if="purgeCount === null"
              color="error" variant="ghost" size="sm" icon="i-lucide-eraser"
              label="Delete test accounts"
              title="Every account whose e-mail ends in @example.com"
              :loading="purging"
              @click="countTestAccounts"
            />
            <template v-else-if="purgeCount === 0">
              <span class="text-xs text-white/40">No {{ TEST_DOMAIN }} accounts.</span>
              <UButton color="neutral" variant="ghost" size="sm" label="OK" @click="purgeCount = null" />
            </template>
            <template v-else>
              <UButton
                color="error" size="sm" icon="i-lucide-triangle-alert"
                :label="`Delete ${purgeCount}${purgeCapped ? '+' : ''} ${TEST_DOMAIN} account(s) for good?`"
                :loading="purging"
                @click="purgeTestAccounts"
              />
              <UButton color="neutral" variant="ghost" size="sm" label="Cancel" @click="purgeCount = null" />
            </template>
          </div>
        </div>

        <p v-if="usersError" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{{ usersError }}</p>

        <UCard :ui="{ body: 'p-0' }">
          <p v-if="!users.length && !usersLoading" class="p-6 text-sm text-white/40">
            {{ userSearch ? 'Nobody matches that.' : 'No accounts yet.' }}
          </p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs text-white/40">
                <tr>
                  <th class="p-3 font-medium">Account</th>
                  <th class="p-3 font-medium">E-mail</th>
                  <th class="p-3 font-medium">Minecraft</th>
                  <th class="p-3 text-right font-medium">Friends</th>
                  <th class="p-3 text-right font-medium">Shares</th>
                  <th class="p-3 font-medium">Joined</th>
                  <th class="p-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="u in users"
                  :key="u.id"
                  class="border-t border-white/6 align-top"
                  :class="u.banned && 'bg-red-500/5'"
                >
                  <td class="p-3">
                    <div class="flex items-start gap-3">
                      <img v-if="u.image" :src="u.image" alt="" class="size-8 shrink-0 rounded-full object-cover">
                      <span
                        v-else
                        class="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        :style="`background:hsl(${initialsAvatar(u.username || u.name).hue} 60% 30%)`"
                      >{{ initialsAvatar(u.username || u.name).letter }}</span>

                      <div v-if="editing === u.id" class="space-y-1.5">
                        <UInput v-model="draft.name" size="xs" placeholder="Display name" />
                        <UInput v-model="draft.username" size="xs" placeholder="username" />
                      </div>
                      <div v-else class="min-w-0">
                        <div class="flex items-center gap-1.5 truncate font-medium">
                          {{ u.name || '—' }}
                          <UIcon v-if="u.banned" name="i-lucide-ban" class="size-3.5 shrink-0 text-red-400" title="Banned" />
                        </div>
                        <div class="truncate text-xs text-white/45">@{{ u.username || '—' }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="p-3">
                    <div class="truncate text-xs">{{ u.email }}</div>
                    <div v-if="!u.emailVerified" class="text-[11px] text-amber-300/70">unverified</div>
                  </td>
                  <td class="p-3 text-xs text-white/60">{{ u.mcUsername || '—' }}</td>
                  <td class="p-3 text-right font-mono text-xs">{{ u.friends }}</td>
                  <td class="p-3 text-right font-mono text-xs">{{ u.shares }}</td>
                  <td class="p-3 text-xs text-white/50">{{ shortDate(u.createdAt) }}</td>
                  <td class="p-3">
                    <div class="flex flex-wrap justify-end gap-1.5">
                      <template v-if="editing === u.id">
                        <UButton size="xs" icon="i-lucide-check" label="Save" :loading="rowBusy === u.id" @click="saveEdit(u.id)" />
                        <UButton size="xs" color="neutral" variant="ghost" label="Cancel" @click="editing = null" />
                      </template>
                      <template v-else>
                        <UButton
                          size="xs" color="neutral" variant="soft" icon="i-lucide-pencil"
                          title="Edit name and username" @click="startEdit(u)"
                        />
                        <UButton
                          size="xs" variant="soft"
                          :color="u.banned ? 'success' : 'warning'"
                          :icon="u.banned ? 'i-lucide-check-circle' : 'i-lucide-ban'"
                          :title="u.banned ? 'Lift the ban' : 'Ban this account'"
                          :loading="rowBusy === u.id"
                          @click="patchUser(u.id, { banned: !u.banned })"
                        />
                        <UButton
                          v-if="confirmDelete === u.id"
                          size="xs" color="error" label="Delete for good?"
                          :loading="rowBusy === u.id"
                          @click="removeUser(u.id)"
                        />
                        <UButton
                          v-else
                          size="xs" color="error" variant="soft" icon="i-lucide-trash-2"
                          title="Delete this account"
                          @click="confirmDelete = u.id"
                        />
                      </template>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>

      <!-- discord -->
      <!-- Kept mounted so switching tabs does not throw away a half-typed
           message or a loaded transcript. -->
      <div v-show="tab === 'discord'">
        <AdminDiscord v-if="discordOpened" ref="discordPanel" @unauthorized="authed = false" />
      </div>
    </div>
  </section>
</template>
