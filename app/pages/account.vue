<script setup lang="ts">
// Everything about *my* account on one page: profile, friends, security,
// connected providers. Split it up when a section outgrows a screen, not before.

import qrcode from 'qrcode-generator'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthClient()
const session = useAuthSession()

const user = computed(() => session.value.data?.user as any)
watchEffect(() => {
  if (import.meta.client && !session.value.isPending && !session.value.data) {
    navigateTo(localePath('/login'))
  }
})

const busy = ref('')
const error = ref('')
const notice = ref('')
async function run(key: string, fn: () => Promise<any>) {
  busy.value = key
  error.value = ''
  notice.value = ''
  try {
    const res = await fn()
    if (res?.error) error.value = res.error.message || t('auth.genericError')
    return res
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || t('auth.genericError')
  } finally {
    busy.value = ''
  }
}

// --- profile ---------------------------------------------------------------
const profile = reactive({ name: '', username: '', image: '' })
watch(user, (u) => {
  if (!u) return
  profile.name = u.name ?? ''
  profile.username = u.username ?? ''
  profile.image = u.image ?? ''
}, { immediate: true })

const avatar = computed(() => initialsAvatar(profile.username || profile.name))

// --- avatar upload ---------------------------------------------------------
// Downscaled here rather than on the server: a 256px WebP is ~20 KB, so the
// upload is instant and the backend never needs an image library.
const AVATAR_PX = 256
const fileInput = ref<HTMLInputElement>()

function toSquareWebp(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = AVATAR_PX
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      // Centre-crop to a square, then scale.
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/webp', 0.9)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('not an image'))
    img.src = URL.createObjectURL(file)
  })
}

const pickAvatar = () => fileInput.value?.click()

async function uploadAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  ;(event.target as HTMLInputElement).value = ''

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    error.value = t('account.avatarUnsupported')
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    error.value = t('account.avatarTooBig')
    return
  }

  await run('avatar', async () => {
    const blob = await toSquareWebp(file)
    const { url } = await $fetch<{ url: string }>('/api/me/avatar', {
      method: 'POST',
      body: blob,
      headers: { 'content-type': 'image/webp' },
    })
    profile.image = url
    notice.value = t('account.avatarUploaded')
  })
}

const saveProfile = () => run('profile', async () => {
  const res = await auth.updateUser({
    name: profile.name,
    image: profile.image || null,
    username: profile.username,
  } as any)
  if (!res?.error) notice.value = t('account.saved')
  return res
})

// --- e-mail & password -----------------------------------------------------
const newEmail = ref('')
const changeEmail = () => run('email', async () => {
  const res = await auth.changeEmail({ newEmail: newEmail.value, callbackURL: localePath('/account') })
  if (!res?.error) notice.value = t('account.emailPending')
  return res
})

const pw = reactive({ current: '', next: '' })
const changePassword = () => run('password', async () => {
  const res = await auth.changePassword({
    currentPassword: pw.current,
    newPassword: pw.next,
    revokeOtherSessions: true,
  })
  if (!res?.error) {
    notice.value = t('account.passwordChanged')
    pw.current = ''
    pw.next = ''
  }
  return res
})

// --- two-factor ------------------------------------------------------------
const twoFa = reactive({ password: '', code: '', uri: '', backup: [] as string[] })
const qrSvg = computed(() => {
  if (!twoFa.uri) return ''
  const qr = qrcode(0, 'M')
  qr.addData(twoFa.uri)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 1 })
})

const enable2fa = () => run('2fa', async () => {
  const res = await auth.twoFactor.enable({ password: twoFa.password })
  if (res?.data) {
    twoFa.uri = (res.data as any).totpURI
    twoFa.backup = (res.data as any).backupCodes ?? []
  }
  return res
})
// Enabling only counts once a generated code verifies — otherwise a mistyped
// secret locks the account out at the next sign-in.
const confirm2fa = () => run('2fa', async () => {
  const res = await auth.twoFactor.verifyTotp({ code: twoFa.code })
  if (!res?.error) {
    twoFa.uri = ''
    twoFa.code = ''
    notice.value = t('account.twoFaOn')
  }
  return res
})
const disable2fa = () => run('2fa', async () => {
  const res = await auth.twoFactor.disable({ password: twoFa.password })
  if (!res?.error) notice.value = t('account.twoFaOff')
  return res
})

// --- connected providers ---------------------------------------------------
const { data: providerList } = await useFetch<{ providers: string[] }>('/api/auth-providers')
const accounts = ref<any[]>([])
const loadAccounts = async () => {
  const res = await auth.listAccounts()
  accounts.value = (res.data ?? []) as any[]
}
onMounted(loadAccounts)
const linked = (id: string) => accounts.value.some(a => a.providerId === id || a.provider === id)
const link = (provider: string) => auth.linkSocial({ provider: provider as any, callbackURL: localePath('/account') })
const unlink = (providerId: string) => run('link', async () => {
  const res = await auth.unlinkAccount({ providerId })
  await loadAccounts()
  return res
})

// --- friends ---------------------------------------------------------------
interface PublicUser { id: string, name: string | null, username: string | null, image: string | null }
type Friend = PublicUser & { friendshipId: number }

const { data: friends, refresh: refreshFriends } = await useFetch<{
  friends: Friend[]
  incoming: { id: number, user: PublicUser }[]
  outgoing: { id: number, user: PublicUser }[]
}>('/api/friends', { server: false })

const friendQuery = ref('')
const addFriend = () => run('friend', async () => {
  await $fetch('/api/friends', { method: 'POST', body: { query: friendQuery.value } })
  friendQuery.value = ''
  notice.value = t('friends.requestSent')
  await refreshFriends()
})
const answer = (id: number, action: 'accept' | 'reject') => run('friend', async () => {
  await $fetch(`/api/friends/${id}`, { method: 'PATCH', body: { action } })
  await refreshFriends()
})
const removeFriend = (id: number) => run('friend', async () => {
  await $fetch(`/api/friends/${id}`, { method: 'DELETE' })
  await refreshFriends()
})
const label = (u: PublicUser) => u.username || u.name || '—'

const signOut = async () => {
  await auth.signOut()
  await navigateTo(localePath('/'))
}

useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
useSeoMeta({ title: () => t('account.title') })

// --- presentation ----------------------------------------------------------
const PROVIDER_META: Record<string, { icon: string, label: string }> = {
  discord: { icon: 'i-simple-icons-discord', label: 'Discord' },
  google: { icon: 'i-simple-icons-google', label: 'Google' },
  github: { icon: 'i-simple-icons-github', label: 'GitHub' },
  microsoft: { icon: 'i-simple-icons-microsoft', label: 'Microsoft' },
}
const providerMeta = (id: string) => PROVIDER_META[id] ?? { icon: 'i-lucide-key-round', label: id }

// The same glass surface the sign-in page uses, so the account does not look
// like a different product.
const CARD = 'relative rounded-[22px] border border-white/[0.08] p-[clamp(20px,2.6vw,30px)]'
const CARD_STYLE = 'background:rgba(9,14,24,.72);backdrop-filter:blur(18px);'
  + 'box-shadow:0 30px 90px -40px rgba(2,8,20,.95)'
const FIELD = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] '
  + 'text-white placeholder-white/30 outline-none transition '
  + 'focus:border-[rgba(125,211,252,.55)] focus:bg-white/[0.06] focus:ring-2 focus:ring-sky-400/15'
const LABEL = 'mb-1.5 block text-[12px] font-medium tracking-wide text-white/45'
const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold '
  + 'text-[#04121f] transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-55'
const BTN_STYLE = 'background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);'
  + 'box-shadow:0 10px 26px -12px rgba(56,189,248,.65)'
const BTN_GHOST = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.09] '
  + 'bg-white/[0.03] px-4 py-2.5 text-[14px] font-semibold text-white/85 transition '
  + 'hover:border-[rgba(125,211,252,.45)] hover:bg-white/[0.06] disabled:opacity-55'
</script>

<template>
  <section v-if="user" class="relative isolate overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
      <div
        style="position:absolute;inset:0;background-image:linear-gradient(rgba(56,189,248,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.08) 1px,transparent 1px);background-size:88px 88px;-webkit-mask-image:radial-gradient(110% 60% at 30% 0%,#000 15%,transparent 70%);mask-image:radial-gradient(110% 60% at 30% 0%,#000 15%,transparent 70%)"
      />
      <div
        style="position:absolute;top:-190px;right:6%;width:520px;height:460px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.22),transparent 65%);filter:blur(65px)"
      />
    </div>

    <div class="mx-auto max-w-3xl space-y-5 px-[clamp(18px,4vw,48px)] pt-24 pb-24">
      <!-- identity -->
      <header :class="CARD" :style="CARD_STYLE">
        <div
          aria-hidden="true"
          class="absolute inset-x-10 top-0 h-px"
          style="background:linear-gradient(90deg,transparent,rgba(125,211,252,.6),transparent)"
        />
        <div class="flex flex-wrap items-center gap-5">
          <button
            type="button"
            class="group relative size-[74px] shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 transition hover:ring-[rgba(125,211,252,.5)]"
            :title="$t('account.upload')"
            @click="pickAvatar"
          >
            <img v-if="profile.image" :src="profile.image" alt="" class="size-full object-cover">
            <span
              v-else
              class="flex size-full items-center justify-center text-3xl font-bold text-white/90"
              :style="`background:hsl(${avatar.hue} 60% 30%)`"
            >{{ avatar.letter }}</span>
            <span class="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
              <UIcon
                :name="busy === 'avatar' ? 'i-lucide-loader-circle' : 'i-lucide-camera'"
                class="size-5 text-white"
                :class="busy === 'avatar' && 'animate-spin'"
              />
            </span>
          </button>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden"
            @change="uploadAvatar"
          >

          <div class="min-w-0 flex-1">
            <h1 class="font-display truncate text-[26px] leading-tight font-bold tracking-[-0.02em]">
              {{ profile.name || profile.username }}
            </h1>
            <p v-if="profile.username" class="truncate text-sm text-white/45">@{{ profile.username }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/60">{{ user.email }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]"
                :style="user.emailVerified
                  ? 'background:rgba(52,211,153,.12);color:#6ee7b7'
                  : 'background:rgba(251,191,36,.12);color:#fcd34d'"
              >
                <UIcon :name="user.emailVerified ? 'i-lucide-badge-check' : 'i-lucide-mail-warning'" class="size-3.5" />
                {{ user.emailVerified ? $t('account.verified') : $t('account.unverified') }}
              </span>
              <span
                v-if="user.twoFactorEnabled"
                class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]"
                style="background:rgba(56,189,248,.1);color:#7dd3fc"
              >
                <UIcon name="i-lucide-shield-check" class="size-3.5" />{{ $t('account.twoFactor') }}
              </span>
            </div>
          </div>

          <button type="button" :class="BTN_GHOST" @click="signOut">
            <UIcon name="i-lucide-log-out" class="size-4" />{{ $t('account.signOut') }}
          </button>
        </div>
      </header>

      <p
        v-if="error"
        class="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3.5 py-2.5 text-sm text-red-200"
      >
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />{{ error }}
      </p>
      <p
        v-if="notice"
        class="flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2.5 text-sm text-emerald-200"
      >
        <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0" />{{ notice }}
      </p>

      <!-- profile -->
      <section :class="CARD" :style="CARD_STYLE">
        <h2 class="flex items-center gap-2 text-[15px] font-semibold">
          <UIcon name="i-lucide-user-round" class="size-4 text-sky-300/80" />{{ $t('account.profile') }}
        </h2>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label :class="LABEL">{{ $t('auth.username') }}</label>
            <input v-model="profile.username" :class="FIELD" autocomplete="username">
          </div>
          <div>
            <label :class="LABEL">{{ $t('account.displayName') }}</label>
            <input v-model="profile.name" :class="FIELD">
          </div>
          <div class="sm:col-span-2">
            <label :class="LABEL">{{ $t('account.avatarUrl') }}</label>
            <div class="flex flex-wrap gap-2">
              <input v-model="profile.image" :class="FIELD + ' min-w-[220px] flex-1'" placeholder="https://…">
              <button type="button" :class="BTN_GHOST" :disabled="busy === 'avatar'" @click="pickAvatar">
                <UIcon name="i-lucide-upload" class="size-4" />
                {{ busy === 'avatar' ? $t('account.uploading') : $t('account.upload') }}
              </button>
            </div>
            <p class="mt-1.5 text-[12px] text-white/35">{{ $t('account.uploadHint') }}</p>
          </div>
        </div>
        <button
          type="button"
          :class="BTN + ' mt-5'"
          :style="BTN_STYLE"
          :disabled="busy === 'profile'"
          @click="saveProfile"
        >{{ busy === 'profile' ? $t('auth.working') : $t('account.save') }}</button>
      </section>

      <!-- friends -->
      <section :class="CARD" :style="CARD_STYLE">
        <h2 class="flex items-center gap-2 text-[15px] font-semibold">
          <UIcon name="i-lucide-users" class="size-4 text-sky-300/80" />{{ $t('friends.title') }}
          <span v-if="friends?.friends?.length" class="text-white/35">· {{ friends.friends.length }}</span>
        </h2>

        <form class="mt-5 flex flex-wrap gap-2" @submit.prevent="addFriend">
          <input
            v-model="friendQuery"
            :class="FIELD + ' min-w-[200px] flex-1'"
            :placeholder="$t('friends.addPlaceholder')"
          >
          <button type="submit" :class="BTN" :style="BTN_STYLE" :disabled="busy === 'friend' || !friendQuery">
            <UIcon name="i-lucide-user-plus" class="size-4" />{{ $t('friends.add') }}
          </button>
        </form>

        <div v-if="friends?.incoming?.length" class="mt-6">
          <p class="text-[11px] tracking-[0.16em] text-white/35 uppercase">{{ $t('friends.incoming') }}</p>
          <div
            v-for="r in friends.incoming"
            :key="r.id"
            class="mt-2 flex items-center gap-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.06] px-3 py-2.5"
          >
            <img v-if="r.user.image" :src="r.user.image" alt="" class="size-8 rounded-full object-cover">
            <span
              v-else
              class="flex size-8 items-center justify-center rounded-full text-xs font-bold"
              :style="`background:hsl(${initialsAvatar(label(r.user)).hue} 60% 30%)`"
            >{{ initialsAvatar(label(r.user)).letter }}</span>
            <span class="flex-1 truncate text-sm font-medium">{{ label(r.user) }}</span>
            <button
              type="button"
              :class="BTN + ' !px-3 !py-1.5 !text-[13px]'"
              :style="BTN_STYLE"
              @click="answer(r.id, 'accept')"
            >{{ $t('friends.accept') }}</button>
            <button
              type="button"
              :class="BTN_GHOST + ' !px-3 !py-1.5 !text-[13px]'"
              @click="answer(r.id, 'reject')"
            >{{ $t('friends.reject') }}</button>
          </div>
        </div>

        <div v-if="friends?.outgoing?.length" class="mt-6">
          <p class="text-[11px] tracking-[0.16em] text-white/35 uppercase">{{ $t('friends.outgoing') }}</p>
          <div
            v-for="r in friends.outgoing"
            :key="r.id"
            class="mt-2 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5"
          >
            <span class="flex-1 truncate text-sm text-white/70">{{ label(r.user) }}</span>
            <span class="text-[12px] text-white/30">{{ $t('friends.pending') }}</span>
            <button
              type="button"
              class="rounded-lg p-1.5 text-white/35 transition hover:bg-white/5 hover:text-white/80"
              @click="removeFriend(r.id)"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>
        </div>

        <ul v-if="friends?.friends?.length" class="mt-6 space-y-2">
          <li
            v-for="f in friends.friends"
            :key="f.id"
            class="group flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 transition hover:bg-white/[0.07]"
          >
            <img v-if="f.image" :src="f.image" alt="" class="size-8 rounded-full object-cover">
            <span
              v-else
              class="flex size-8 items-center justify-center rounded-full text-xs font-bold"
              :style="`background:hsl(${initialsAvatar(label(f)).hue} 60% 30%)`"
            >{{ initialsAvatar(label(f)).letter }}</span>
            <NuxtLink :to="localePath(`/u/${f.username}`)" class="flex-1 truncate text-sm font-medium hover:underline">
              {{ label(f) }}
            </NuxtLink>
            <button
              type="button"
              class="rounded-lg p-1.5 text-white/25 opacity-0 transition group-hover:opacity-100 hover:bg-white/5 hover:text-red-300"
              :title="$t('friends.remove')"
              @click="removeFriend(f.friendshipId)"
            >
              <UIcon name="i-lucide-user-minus" class="size-4" />
            </button>
          </li>
        </ul>

        <div v-else class="mt-6 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <UIcon name="i-lucide-users" class="mx-auto size-7 text-white/15" />
          <p class="mt-2 text-sm text-white/40">{{ $t('friends.empty') }}</p>
        </div>
      </section>

      <!-- security -->
      <section :class="CARD" :style="CARD_STYLE">
        <h2 class="flex items-center gap-2 text-[15px] font-semibold">
          <UIcon name="i-lucide-shield" class="size-4 text-sky-300/80" />{{ $t('account.security') }}
        </h2>

        <div class="mt-5 flex flex-wrap items-end gap-2">
          <div class="min-w-[220px] flex-1">
            <label :class="LABEL">{{ $t('account.newEmail') }}</label>
            <input v-model="newEmail" type="email" :class="FIELD">
          </div>
          <button type="button" :class="BTN_GHOST" :disabled="busy === 'email' || !newEmail" @click="changeEmail">
            {{ $t('account.changeEmail') }}
          </button>
        </div>

        <div class="mt-5 flex flex-wrap items-end gap-2">
          <div class="min-w-[160px] flex-1">
            <label :class="LABEL">{{ $t('account.currentPassword') }}</label>
            <input v-model="pw.current" type="password" autocomplete="current-password" :class="FIELD">
          </div>
          <div class="min-w-[160px] flex-1">
            <label :class="LABEL">{{ $t('account.newPassword') }}</label>
            <input v-model="pw.next" type="password" autocomplete="new-password" :class="FIELD">
          </div>
          <button
            type="button"
            :class="BTN_GHOST"
            :disabled="busy === 'password' || !pw.current || pw.next.length < 8"
            @click="changePassword"
          >{{ $t('account.changePassword') }}</button>
        </div>

        <div class="mt-7 border-t border-white/[0.07] pt-6">
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-[200px] flex-1">
              <p class="text-sm font-semibold">{{ $t('account.twoFactor') }}</p>
              <p class="mt-1 text-[13px] leading-relaxed text-white/45">{{ $t('account.twoFactorHint') }}</p>
            </div>
            <span
              class="rounded-full px-2.5 py-1 text-[12px]"
              :style="user.twoFactorEnabled
                ? 'background:rgba(52,211,153,.12);color:#6ee7b7'
                : 'background:rgba(255,255,255,.06);color:rgba(255,255,255,.5)'"
            >{{ user.twoFactorEnabled ? $t('account.on') : $t('account.off') }}</span>
          </div>

          <div class="mt-4 flex flex-wrap items-end gap-2">
            <div class="min-w-[200px] flex-1">
              <label :class="LABEL">{{ $t('auth.password') }}</label>
              <input v-model="twoFa.password" type="password" :class="FIELD">
            </div>
            <button
              v-if="!user.twoFactorEnabled"
              type="button"
              :class="BTN"
              :style="BTN_STYLE"
              :disabled="busy === '2fa' || !twoFa.password"
              @click="enable2fa"
            >{{ $t('account.enable') }}</button>
            <button
              v-else
              type="button"
              class="inline-flex items-center justify-center rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-[14px] font-semibold text-red-200 transition hover:bg-red-400/15 disabled:opacity-55"
              :disabled="busy === '2fa' || !twoFa.password"
              @click="disable2fa"
            >{{ $t('account.disable') }}</button>
          </div>

          <div v-if="twoFa.uri" class="mt-5 rounded-2xl border border-white/10 bg-black/30 p-5">
            <div class="flex flex-wrap items-center gap-5">
              <!-- eslint-disable-next-line vue/no-v-html -- generated locally from our own URI -->
              <div class="rounded-xl bg-white p-2.5" v-html="qrSvg" />
              <div class="min-w-[220px] flex-1 space-y-3">
                <p class="text-sm leading-relaxed text-white/65">{{ $t('account.scanHint') }}</p>
                <div class="flex gap-2">
                  <input
                    v-model="twoFa.code"
                    inputmode="numeric"
                    placeholder="000000"
                    :class="FIELD + ' max-w-[150px] text-center font-mono tracking-[0.3em]'"
                  >
                  <button type="button" :class="BTN" :style="BTN_STYLE" :disabled="busy === '2fa'" @click="confirm2fa">
                    {{ $t('auth.verify') }}
                  </button>
                </div>
              </div>
            </div>
            <div v-if="twoFa.backup.length" class="mt-5 border-t border-white/10 pt-4">
              <p class="text-[11px] tracking-[0.16em] text-white/35 uppercase">{{ $t('account.backupCodes') }}</p>
              <div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                <code
                  v-for="c in twoFa.backup"
                  :key="c"
                  class="rounded-lg bg-white/[0.05] px-2 py-1.5 text-center font-mono text-[12px] text-white/75"
                >{{ c }}</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- connected accounts -->
      <section :class="CARD" :style="CARD_STYLE">
        <h2 class="flex items-center gap-2 text-[15px] font-semibold">
          <UIcon name="i-lucide-link" class="size-4 text-sky-300/80" />{{ $t('account.connected') }}
        </h2>
        <div class="mt-5 space-y-2">
          <div
            v-for="p in providerList?.providers ?? []"
            :key="p"
            class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3"
          >
            <UIcon :name="providerMeta(p).icon" class="size-[18px] text-white/70" />
            <span class="flex-1 text-sm font-medium">{{ providerMeta(p).label }}</span>
            <span v-if="linked(p)" class="text-[12px] text-emerald-300/80">{{ $t('account.linked') }}</span>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-[13px] font-semibold transition"
              :class="linked(p)
                ? 'text-white/45 hover:bg-white/5 hover:text-white/80'
                : 'border border-white/[0.09] bg-white/[0.03] text-white/85 hover:border-[rgba(125,211,252,.45)]'"
              @click="linked(p) ? unlink(p) : link(p)"
            >{{ linked(p) ? $t('account.unlink') : $t('account.link') }}</button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
