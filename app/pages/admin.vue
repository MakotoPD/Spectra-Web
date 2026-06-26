<script setup lang="ts">
// Internal telemetry dashboard. Gated by the ADMIN_TOKEN cookie (see
// server/api/admin/*). Not linked anywhere public.

interface Bucket { label: string; value: number }
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
}

onMounted(loadStats)

const maxActive = computed(() => Math.max(1, ...(stats.value?.activeSeries.map(d => d.value) ?? [0])))
function pct(value: number, list: Bucket[]) {
  const max = Math.max(1, ...list.map(b => b.value))
  return Math.round((value / max) * 100)
}
const shortDay = (d: string) => d.slice(5) // MM-DD
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
          <h1 class="text-2xl font-bold tracking-tight">Telemetry</h1>
          <p class="text-sm text-white/50">Last 30 days · updated {{ new Date(stats.generatedAt).toLocaleString() }}</p>
        </div>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" label="Refresh" @click="loadStats" />
          <UButton color="neutral" variant="soft" icon="i-lucide-log-out" label="Sign out" @click="logout" />
        </div>
      </div>

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
    </div>
  </section>
</template>
