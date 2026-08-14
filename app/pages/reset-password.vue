<script setup lang="ts">
// Landing page for the link in the password-reset mail. The token lives in the
// query string and is spent here. Same glass surface as the sign-in page.

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const auth = useAuthClient()

const token = computed(() => String(route.query.token ?? ''))
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const done = ref(false)

// Not a strength meter — just enough feedback that the server's minimum does
// not come back as a surprise error after the click.
const tooShort = computed(() => password.value.length > 0 && password.value.length < 8)

async function submit() {
  if (password.value.length < 8) return
  loading.value = true
  error.value = ''
  const res = await auth.resetPassword({ newPassword: password.value, token: token.value })
  loading.value = false
  if (res.error) return void (error.value = res.error.message || t('auth.genericError'))
  done.value = true
}

const FIELD = 'w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pr-11 pl-11 text-[15px] '
  + 'text-white placeholder-white/35 outline-none transition '
  + 'focus:border-[rgba(125,211,252,.55)] focus:bg-white/[0.06] focus:ring-2 focus:ring-sky-400/15'

useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
useSeoMeta({ title: () => t('auth.resetTitle') })
</script>

<template>
  <section class="relative isolate overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
      <div
        style="position:absolute;inset:0;background-image:linear-gradient(rgba(56,189,248,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.09) 1px,transparent 1px);background-size:88px 88px;-webkit-mask-image:radial-gradient(100% 70% at 50% 0%,#000 20%,transparent 72%);mask-image:radial-gradient(100% 70% at 50% 0%,#000 20%,transparent 72%)"
      />
      <div
        style="position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:560px;height:460px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.26),transparent 65%);filter:blur(60px)"
      />
    </div>

    <div class="mx-auto max-w-md px-[clamp(18px,4vw,48px)] pt-28 pb-24">
      <div
        class="relative rounded-[22px] border border-white/[0.08] p-[clamp(24px,3vw,34px)]"
        style="background:rgba(9,14,24,.72);backdrop-filter:blur(18px);box-shadow:0 30px 90px -30px rgba(2,8,20,.95)"
      >
        <div
          aria-hidden="true"
          class="absolute inset-x-8 top-0 h-px"
          style="background:linear-gradient(90deg,transparent,rgba(125,211,252,.65),transparent)"
        />

        <div class="text-center">
          <span
            class="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10"
            :style="done
              ? 'background:rgba(52,211,153,.12);color:#6ee7b7'
              : 'background:rgba(56,189,248,.1);color:#7dd3fc'"
          >
            <UIcon :name="done ? 'i-lucide-check' : 'i-lucide-key-round'" class="size-6" />
          </span>
          <h1 class="font-display mt-4 text-2xl font-bold tracking-[-0.01em]">
            {{ done ? $t('auth.resetDoneTitle') : $t('auth.resetTitle') }}
          </h1>
          <p class="mt-1.5 text-sm" style="color:#8fa2bb">
            {{ done ? $t('auth.resetDone') : $t('auth.resetHint') }}
          </p>
        </div>

        <p
          v-if="error"
          class="mt-6 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2.5 text-sm text-red-200"
        >
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />{{ error }}
        </p>

        <!-- done -->
        <NuxtLink
          v-if="done"
          :to="localePath('/login')"
          class="mt-7 block rounded-xl py-3 text-center text-[15px] font-bold text-[#04121f] no-underline transition hover:-translate-y-px"
          style="background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 30px -10px rgba(56,189,248,.6)"
        >{{ $t('auth.signIn') }}</NuxtLink>

        <!-- link opened without a token -->
        <div v-else-if="!token" class="mt-7 space-y-4">
          <p
            class="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-200"
          >
            <UIcon name="i-lucide-link-2-off" class="mt-0.5 size-4 shrink-0" />{{ $t('auth.resetNoToken') }}
          </p>
          <NuxtLink
            :to="localePath('/login')"
            class="block rounded-xl border border-white/[0.09] bg-white/[0.03] py-3 text-center text-sm font-semibold text-white/85 no-underline transition hover:border-[rgba(125,211,252,.45)] hover:bg-white/[0.06]"
          >{{ $t('auth.backToSignIn') }}</NuxtLink>
        </div>

        <!-- the form -->
        <form v-else class="mt-7 space-y-3" @submit.prevent="submit">
          <div class="relative">
            <UIcon name="i-lucide-lock" class="absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-white/35" />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              :placeholder="$t('account.newPassword')"
              :class="FIELD"
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

          <p class="px-1 text-xs" :class="tooShort ? 'text-amber-300/80' : 'text-white/35'">
            {{ $t('auth.passwordRule') }}
          </p>

          <button
            type="submit"
            :disabled="loading || password.length < 8"
            class="w-full rounded-xl py-3 text-[15px] font-bold text-[#04121f] transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50"
            style="background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 30px -10px rgba(56,189,248,.6)"
          >{{ loading ? $t('auth.working') : $t('auth.setPassword') }}</button>
        </form>
      </div>
    </div>
  </section>
</template>
