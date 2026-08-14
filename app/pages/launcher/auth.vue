<script setup lang="ts">
// Hand-off page for "sign in" inside the desktop launcher.
//
// The launcher opens this URL in the system browser. Once there is a session it
// mints a short-lived one-time token and bounces back into the app through the
// `spectra://` deep link the launcher already registers for share codes. The
// launcher swaps that token for a real session token it can send as a bearer.

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthClient()
const session = useAuthSession()

const state = ref<'working' | 'ready' | 'error'>('working')
const deepLink = ref('')
const me = computed(() => session.value.data?.user as any)

async function handOff() {
  const res = await auth.oneTimeToken.generate()
  const token = (res.data as any)?.token
  if (!token) return void (state.value = 'error')
  deepLink.value = `spectra://auth/${token}`
  state.value = 'ready'
  window.location.href = deepLink.value
}

watchEffect(() => {
  if (!import.meta.client || session.value.isPending || state.value !== 'working') return
  if (!session.value.data) {
    navigateTo(localePath('/login') + `?next=${encodeURIComponent(localePath('/launcher/auth'))}`)
    return
  }
  handOff()
})

useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
useSeoMeta({ title: () => t('launcherAuth.title') })
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
          <!-- logo → launcher, with the state riding on the arrow between them -->
          <div class="flex items-center justify-center gap-3">
            <img src="/logo.png" width="38" height="38" alt="" style="filter:drop-shadow(0 0 12px rgba(56,189,248,.45))">
            <UIcon
              :name="state === 'error' ? 'i-lucide-x' : 'i-lucide-arrow-right'"
              class="size-4"
              :class="state === 'error' ? 'text-red-300' : 'text-white/30'"
            />
            <span
              class="flex size-[38px] items-center justify-center rounded-xl border border-white/10"
              :style="state === 'error'
                ? 'background:rgba(248,113,113,.1);color:#fca5a5'
                : 'background:rgba(56,189,248,.1);color:#7dd3fc'"
            >
              <UIcon
                :name="state === 'working' ? 'i-lucide-loader-circle' : 'i-lucide-monitor'"
                class="size-[18px]"
                :class="state === 'working' && 'animate-spin'"
              />
            </span>
          </div>

          <h1 class="font-display mt-5 text-2xl font-bold tracking-[-0.01em]">{{ $t('launcherAuth.title') }}</h1>
          <p class="mt-1.5 text-sm" style="color:#8fa2bb">
            {{ state === 'error' ? $t('launcherAuth.failed') : $t('launcherAuth.hint') }}
          </p>
        </div>

        <!-- who is being linked -->
        <div v-if="me" class="mt-6 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3">
          <img v-if="me.image" :src="me.image" alt="" class="size-9 rounded-full object-cover">
          <span
            v-else
            class="flex size-9 items-center justify-center rounded-full text-sm font-bold"
            :style="`background:hsl(${initialsAvatar(me.username || me.name).hue} 60% 30%)`"
          >{{ initialsAvatar(me.username || me.name).letter }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ me.username || me.name }}</p>
            <p class="truncate text-[12px] text-white/40">{{ $t('launcherAuth.signedInAs') }}</p>
          </div>
          <UIcon v-if="state === 'ready'" name="i-lucide-check" class="size-4 text-emerald-300" />
        </div>

        <a
          v-if="state === 'ready'"
          :href="deepLink"
          class="mt-5 block rounded-xl py-3 text-center text-[15px] font-bold text-[#04121f] no-underline transition hover:-translate-y-px"
          style="background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 30px -10px rgba(56,189,248,.6)"
        >{{ $t('launcherAuth.openAgain') }}</a>

        <p v-if="state === 'ready'" class="mt-3 text-center text-[12px] text-white/35">
          {{ $t('launcherAuth.closeHint') }}
        </p>

        <NuxtLink
          v-if="state === 'error'"
          :to="localePath('/account')"
          class="mt-5 block rounded-xl border border-white/[0.09] bg-white/[0.03] py-3 text-center text-sm font-semibold text-white/85 no-underline transition hover:border-[rgba(125,211,252,.45)] hover:bg-white/[0.06]"
        >{{ $t('account.title') }}</NuxtLink>
      </div>
    </div>
  </section>
</template>
