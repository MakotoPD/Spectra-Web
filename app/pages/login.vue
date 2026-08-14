<script setup lang="ts">
// Sign in / sign up / two-factor / password reset — four states of the same
// short form, on the site's own dark-glass surface rather than a bare card.

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const auth = useAuthClient()
const { data: release } = useLauncherVersion()

const { data: config } = await useFetch<{ providers: string[], turnstileSiteKey: string }>('/api/auth-providers')

const PROVIDER_META: Record<string, { icon: string, label: string }> = {
  discord: { icon: 'i-simple-icons-discord', label: 'Discord' },
  google: { icon: 'i-simple-icons-google', label: 'Google' },
  github: { icon: 'i-simple-icons-github', label: 'GitHub' },
  microsoft: { icon: 'i-simple-icons-microsoft', label: 'Microsoft' },
}
const providers = computed(() => (config.value?.providers ?? []).map(id => ({ id, ...PROVIDER_META[id]! })))

type Mode = 'signin' | 'signup' | 'twofactor' | 'forgot' | 'verify'
const mode = ref<Mode>(route.query.mode === 'signup' ? 'signup' : 'signin')

const form = reactive({ email: '', password: '', name: '', username: '', code: '' })
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const sent = ref('')

// --- captcha ---------------------------------------------------------------
// better-auth's captcha plugin reads the token off this header and verifies it
// server-side; the widget is only rendered when a site key is configured.
const captchaToken = ref('')
const captcha = ref<{ reset: () => void } | null>(null)
const captchaOn = computed(() => !!config.value?.turnstileSiteKey)
const captchaHeaders = computed(() =>
  captchaToken.value ? { 'x-captcha-response': captchaToken.value } : {})
const blocked = computed(() => loading.value || (captchaOn.value && !captchaToken.value))

const next = computed(() => (route.query.next ? String(route.query.next) : localePath('/account')))

async function run(fn: () => Promise<any>) {
  loading.value = true
  error.value = ''
  sent.value = ''
  try {
    const res = await fn()
    if (res?.error) error.value = res.error.message || t('auth.genericError')
    return res
  } catch (e: any) {
    error.value = e?.message || t('auth.genericError')
  } finally {
    loading.value = false
    // Turnstile tokens are single-use — a retry needs a fresh one.
    captcha.value?.reset()
  }
}

async function signIn() {
  const res = await run(() => auth.signIn.email(
    { email: form.email, password: form.password },
    { headers: captchaHeaders.value },
  ))
  if (res?.error) return
  if (res?.data?.twoFactorRedirect) return void (mode.value = 'twofactor')
  await navigateTo(next.value)
}

async function signUp() {
  const res = await run(() => auth.signUp.email(
    {
      email: form.email,
      password: form.password,
      name: form.name || form.username,
      username: form.username,
    },
    { headers: captchaHeaders.value },
  ))
  if (res?.error) return
  // With e-mail verification on, signing up hands back no session — say so
  // instead of bouncing to a page that immediately redirects back here.
  if (!res?.data?.token) return void (mode.value = 'verify')
  await navigateTo(next.value)
}

async function resendVerification() {
  const res = await run(() => auth.sendVerificationEmail({
    email: form.email,
    callbackURL: next.value,
  }))
  if (!res?.error) sent.value = t('auth.verifyResent')
}

async function verify() {
  const res = await run(() => auth.twoFactor.verifyTotp({ code: form.code }))
  if (!res?.error) await navigateTo(next.value)
}

async function forgot() {
  const res = await run(() => auth.requestPasswordReset(
    { email: form.email, redirectTo: `${location.origin}${localePath('/reset-password')}` },
    { headers: captchaHeaders.value },
  ))
  if (!res?.error) sent.value = t('auth.resetSent')
}

const social = (provider: string) => auth.signIn.social({ provider: provider as any, callbackURL: next.value })

const pitch = computed(() => [
  { icon: 'i-lucide-users', text: t('auth.pitch1') },
  { icon: 'i-lucide-package-check', text: t('auth.pitch2') },
  { icon: 'i-lucide-refresh-cw', text: t('auth.pitch3') },
])

// Shared look for the hand-rolled inputs — Nuxt UI's default is fine in a
// settings form, too plain for the front door.
const FIELD = 'w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pr-4 pl-11 text-[15px] '
  + 'text-white placeholder-white/35 outline-none transition '
  + 'focus:border-[rgba(125,211,252,.55)] focus:bg-white/[0.06] focus:ring-2 focus:ring-sky-400/15'

useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
useSeoMeta({ title: () => t('auth.title') })
</script>

<template>
  <section class="relative isolate overflow-hidden">
    <!-- ambient: the same grid + glow the landing hero uses -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
      <div
        style="position:absolute;inset:0;background-image:linear-gradient(rgba(56,189,248,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.10) 1px,transparent 1px);background-size:88px 88px;-webkit-mask-image:radial-gradient(120% 90% at 20% 0%,#000 20%,transparent 70%);mask-image:radial-gradient(120% 90% at 20% 0%,#000 20%,transparent 70%)"
      />
      <div
        style="position:absolute;top:-160px;left:8%;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.28),transparent 65%);filter:blur(60px)"
      />
      <div
        style="position:absolute;bottom:-200px;right:-60px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(14,165,233,.18),transparent 65%);filter:blur(70px)"
      />
    </div>

    <div
      class="mx-auto grid w-full max-w-6xl items-center gap-16 px-[clamp(18px,4vw,48px)] pt-24 pb-20 lg:grid-cols-[1.05fr_minmax(400px,440px)] lg:pt-28"
    >
      <!-- pitch -->
      <div class="hidden lg:block">
        <span
          class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold tracking-wide"
          style="border-color:rgba(125,211,252,.28);background:rgba(56,189,248,.08);color:#bfe6ff"
        >
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
          {{ $t('auth.badge') }}
        </span>

        <h2 class="font-display mt-6 text-[clamp(32px,3.4vw,46px)] leading-[1.08] font-bold tracking-[-0.02em]">
          {{ $t('auth.pitchTitle') }}
          <span
            style="background:linear-gradient(120deg,#7dd3fc,#38bdf8 45%,#0ea5e9);-webkit-background-clip:text;background-clip:text;color:transparent"
          >{{ $t('auth.pitchTitleAccent') }}</span>
        </h2>

        <ul class="mt-8 space-y-4">
          <li v-for="item in pitch" :key="item.icon" class="flex items-start gap-3">
            <span
              class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10"
              style="background:rgba(56,189,248,.08);color:#7dd3fc"
            >
              <UIcon :name="item.icon" class="size-[18px]" />
            </span>
            <p class="max-w-md text-[15px] leading-relaxed" style="color:#aab9d0">{{ item.text }}</p>
          </li>
        </ul>

        <p v-if="release?.version" class="mt-10 font-mono text-xs text-white/30">
          Spectra Launcher v{{ release.version }}
        </p>
      </div>

      <!-- form -->
      <div
        class="relative rounded-[22px] border border-white/[0.08] p-[clamp(22px,3vw,34px)]"
        style="background:rgba(9,14,24,.72);backdrop-filter:blur(18px);box-shadow:0 30px 90px -30px rgba(2,8,20,.95)"
      >
        <div
          aria-hidden="true"
          class="absolute inset-x-8 top-0 h-px"
          style="background:linear-gradient(90deg,transparent,rgba(125,211,252,.65),transparent)"
        />

        <template v-if="mode === 'signin' || mode === 'signup'">
          <!-- segmented mode switch -->
          <div class="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-black/25 p-1">
            <button
              v-for="tab in (['signin', 'signup'] as const)"
              :key="tab"
              type="button"
              class="rounded-lg py-2 text-sm font-semibold transition"
              :class="mode === tab ? 'text-[#04121f]' : 'text-white/55 hover:text-white/85'"
              :style="mode === tab ? 'background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9)' : ''"
              @click="mode = tab"
            >{{ tab === 'signin' ? $t('auth.signIn') : $t('auth.signUp') }}</button>
          </div>

          <h1 class="font-display mt-7 text-2xl font-bold tracking-[-0.01em]">
            {{ mode === 'signup' ? $t('auth.signUpTitle') : $t('auth.signInTitle') }}
          </h1>
          <p class="mt-1 text-sm" style="color:#8fa2bb">{{ $t('auth.subtitle') }}</p>
        </template>

        <!-- signed up, waiting on the confirmation link -->
        <template v-else-if="mode === 'verify'">
          <div class="text-center">
            <span
              class="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10"
              style="background:rgba(56,189,248,.1);color:#7dd3fc"
            >
              <UIcon name="i-lucide-mail-check" class="size-6" />
            </span>
            <h1 class="font-display mt-4 text-2xl font-bold tracking-[-0.01em]">{{ $t('auth.verifyTitle') }}</h1>
            <p class="mt-2 text-sm leading-relaxed" style="color:#8fa2bb">
              {{ $t('auth.verifyBody') }}
            </p>
            <p class="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 font-medium break-all text-white/85">{{ form.email }}</p>
            <p class="mt-3 text-[13px] leading-relaxed text-white/40">{{ $t('auth.verifySpam') }}</p>
          </div>
        </template>

        <template v-else>
          <button
            type="button"
            class="flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
            @click="mode = 'signin'"
          >
            <UIcon name="i-lucide-arrow-left" class="size-4" />{{ $t('auth.backToSignIn') }}
          </button>
          <h1 class="font-display mt-5 text-2xl font-bold tracking-[-0.01em]">
            {{ mode === 'twofactor' ? $t('auth.twoFactorTitle') : $t('auth.forgotTitle') }}
          </h1>
          <p class="mt-1 text-sm" style="color:#8fa2bb">
            {{ mode === 'twofactor' ? $t('auth.twoFactorHint') : $t('auth.forgotHint') }}
          </p>
        </template>

        <p
          v-if="error"
          class="mt-5 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2.5 text-sm text-red-200"
        >
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />{{ error }}
        </p>
        <p
          v-if="sent"
          class="mt-5 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2.5 text-sm text-emerald-200"
        >
          <UIcon name="i-lucide-mail-check" class="mt-0.5 size-4 shrink-0" />{{ sent }}
        </p>

        <!-- social -->
        <div v-if="providers.length && (mode === 'signin' || mode === 'signup')" class="mt-6 grid grid-cols-2 gap-2">
          <button
            v-for="p in providers"
            :key="p.id"
            type="button"
            class="flex items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] py-2.5 text-sm font-semibold text-white/85 transition hover:border-[rgba(125,211,252,.45)] hover:bg-white/[0.06]"
            @click="social(p.id)"
          >
            <UIcon :name="p.icon" class="size-[18px]" />{{ p.label }}
          </button>
        </div>

        <div
          v-if="providers.length && (mode === 'signin' || mode === 'signup')"
          class="my-6 flex items-center gap-3 text-[11px] tracking-[0.18em] text-white/30 uppercase"
        >
          <span class="h-px flex-1 bg-white/10" />{{ $t('auth.or') }}<span class="h-px flex-1 bg-white/10" />
        </div>

        <!-- verify: nothing to fill in, only a way out and a resend -->
        <div v-if="mode === 'verify'" class="mt-7 space-y-2">
          <button
            type="button"
            :disabled="loading"
            class="w-full rounded-xl border border-white/[0.09] bg-white/[0.03] py-3 text-sm font-semibold text-white/85 transition hover:border-[rgba(125,211,252,.45)] hover:bg-white/[0.06] disabled:opacity-55"
            @click="resendVerification"
          >{{ loading ? $t('auth.working') : $t('auth.verifyResend') }}</button>
          <button
            type="button"
            class="w-full py-2 text-sm text-white/45 transition hover:text-white"
            @click="mode = 'signin'"
          >{{ $t('auth.backToSignIn') }}</button>
        </div>

        <!-- two-factor -->
        <form v-else-if="mode === 'twofactor'" class="mt-6 space-y-4" @submit.prevent="verify">
          <input
            v-model="form.code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
            class="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 text-center font-mono text-2xl tracking-[0.5em] text-white outline-none transition focus:border-[rgba(125,211,252,.55)] focus:ring-2 focus:ring-sky-400/15"
          >
          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-xl py-3 text-[15px] font-bold text-[#04121f] transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-60"
            style="background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 30px -10px rgba(56,189,248,.6)"
          >{{ loading ? $t('auth.working') : $t('auth.verify') }}</button>
        </form>

        <!-- forgot password -->
        <form v-else-if="mode === 'forgot'" class="mt-6 space-y-3" @submit.prevent="forgot">
          <div class="relative">
            <UIcon name="i-lucide-mail" class="absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-white/35" />
            <input v-model="form.email" type="email" autocomplete="email" :placeholder="$t('auth.email')" :class="FIELD">
          </div>
          <TurnstileWidget
            v-if="captchaOn"
            ref="captcha"
            :site-key="config!.turnstileSiteKey"
            class="pt-1"
            @token="captchaToken = $event"
          />
          <button
            type="submit"
            :disabled="blocked"
            class="w-full rounded-xl py-3 text-[15px] font-bold text-[#04121f] transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-60"
            style="background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 30px -10px rgba(56,189,248,.6)"
          >{{ loading ? $t('auth.working') : $t('auth.sendReset') }}</button>
        </form>

        <!-- sign in / sign up -->
        <form v-else class="space-y-3" @submit.prevent="mode === 'signup' ? signUp() : signIn()">
          <div v-if="mode === 'signup'" class="relative">
            <UIcon name="i-lucide-at-sign" class="absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-white/35" />
            <input v-model="form.username" autocomplete="username" :placeholder="$t('auth.username')" :class="FIELD">
          </div>
          <div class="relative">
            <UIcon name="i-lucide-mail" class="absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-white/35" />
            <input v-model="form.email" type="email" autocomplete="email" :placeholder="$t('auth.email')" :class="FIELD">
          </div>
          <div class="relative">
            <UIcon name="i-lucide-lock" class="absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-white/35" />
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              :placeholder="$t('auth.password')"
              :class="FIELD + ' !pr-11'"
            >
            <button
              type="button"
              class="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-white/35 transition hover:text-white/80"
              :aria-label="$t('auth.togglePassword')"
              @click="showPassword = !showPassword"
            >
              <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-[18px]" />
            </button>
          </div>

          <TurnstileWidget
            v-if="captchaOn"
            ref="captcha"
            :site-key="config!.turnstileSiteKey"
            class="pt-1"
            @token="captchaToken = $event"
          />

          <button
            type="submit"
            :disabled="blocked"
            class="w-full rounded-xl py-3 text-[15px] font-bold text-[#04121f] transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-60"
            style="background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 30px -10px rgba(56,189,248,.6)"
          >{{ loading ? $t('auth.working') : (mode === 'signup' ? $t('auth.signUp') : $t('auth.signIn')) }}</button>

          <div class="flex items-center justify-between pt-1 text-sm">
            <button
              type="button"
              class="text-white/50 transition hover:text-white"
              @click="mode = mode === 'signup' ? 'signin' : 'signup'"
            >{{ mode === 'signup' ? $t('auth.haveAccount') : $t('auth.noAccount') }}</button>
            <button
              v-if="mode === 'signin'"
              type="button"
              class="text-white/50 transition hover:text-white"
              @click="mode = 'forgot'"
            >{{ $t('auth.forgot') }}</button>
          </div>
        </form>

        <p v-if="mode === 'signup'" class="mt-5 text-center text-[12px] leading-relaxed text-white/35">
          {{ $t('auth.terms') }}
        </p>
      </div>
    </div>
  </section>
</template>
