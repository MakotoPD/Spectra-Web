<script setup lang="ts">
// Public profile. Anyone can look someone up by username — this is the page a
// share invite or a friend list links to.

interface PublicUser { id: string, name: string | null, username: string | null, image: string | null }

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const username = String(route.params.username ?? '')
const { data, error } = await useFetch<{ user: PublicUser & { createdAt: string }, friends: PublicUser[] }>(
  `/api/u/${encodeURIComponent(username)}`,
)

const label = (u: PublicUser) => u.username || u.name || '—'
const joined = computed(() => {
  if (!data.value) return ''
  return new Date(data.value.user.createdAt)
    .toLocaleDateString(locale.value, { year: 'numeric', month: 'long' })
})

const CARD = 'relative rounded-[22px] border border-white/[0.08] p-[clamp(22px,3vw,34px)]'
const CARD_STYLE = 'background:rgba(9,14,24,.72);backdrop-filter:blur(18px);'
  + 'box-shadow:0 30px 90px -35px rgba(2,8,20,.95)'

useSeoMeta({
  title: () => (data.value ? label(data.value.user) : t('profile.notFound')),
  description: () => t('profile.metaDescription', { name: username }),
})
</script>

<template>
  <section class="relative isolate overflow-hidden">
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
      <div
        style="position:absolute;inset:0;background-image:linear-gradient(rgba(56,189,248,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.08) 1px,transparent 1px);background-size:88px 88px;-webkit-mask-image:radial-gradient(110% 65% at 50% 0%,#000 15%,transparent 72%);mask-image:radial-gradient(110% 65% at 50% 0%,#000 15%,transparent 72%)"
      />
      <div
        style="position:absolute;top:-190px;left:50%;transform:translateX(-50%);width:600px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.22),transparent 65%);filter:blur(65px)"
      />
    </div>

    <div class="mx-auto max-w-2xl px-[clamp(18px,4vw,48px)] pt-28 pb-24">
      <!-- unknown player -->
      <div v-if="error || !data" :class="CARD" :style="CARD_STYLE">
        <div class="py-6 text-center">
          <span class="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <UIcon name="i-lucide-user-x" class="size-6 text-white/35" />
          </span>
          <h1 class="font-display mt-4 text-2xl font-bold">{{ $t('profile.notFound') }}</h1>
          <p class="mt-1.5 text-sm text-white/45">@{{ username }}</p>
          <NuxtLink
            :to="localePath('/')"
            class="mt-6 inline-block rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white/85 no-underline transition hover:border-[rgba(125,211,252,.45)] hover:bg-white/[0.06]"
          >{{ $t('share.backHome') }}</NuxtLink>
        </div>
      </div>

      <div v-else :class="CARD" :style="CARD_STYLE">
        <div
          aria-hidden="true"
          class="absolute inset-x-12 top-0 h-px"
          style="background:linear-gradient(90deg,transparent,rgba(125,211,252,.6),transparent)"
        />

        <div class="flex flex-wrap items-center gap-5">
          <img
            v-if="data.user.image"
            :src="data.user.image"
            alt=""
            class="size-[86px] rounded-2xl object-cover ring-1 ring-white/10"
          >
          <div
            v-else
            class="flex size-[86px] items-center justify-center rounded-2xl text-4xl font-bold text-white/90 ring-1 ring-white/10"
            :style="`background:hsl(${initialsAvatar(label(data.user)).hue} 60% 30%)`"
          >{{ initialsAvatar(label(data.user)).letter }}</div>

          <div class="min-w-0 flex-1">
            <h1 class="font-display truncate text-[28px] leading-tight font-bold tracking-[-0.02em]">
              {{ data.user.name || label(data.user) }}
            </h1>
            <p v-if="data.user.username" class="truncate text-sm text-white/45">@{{ data.user.username }}</p>
            <div class="mt-2.5 flex flex-wrap gap-2 text-[12px]">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-white/60">
                <UIcon name="i-lucide-calendar" class="size-3.5" />{{ $t('profile.joined', { date: joined }) }}
              </span>
              <span
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style="background:rgba(56,189,248,.1);color:#7dd3fc"
              >
                <UIcon name="i-lucide-users" class="size-3.5" />{{ data.friends.length }}
              </span>
            </div>
          </div>
        </div>

        <p class="mt-6 text-sm leading-relaxed text-white/45">{{ $t('profile.shared') }}</p>

        <div class="mt-7 border-t border-white/[0.07] pt-6">
          <p class="text-[11px] tracking-[0.16em] text-white/35 uppercase">
            {{ $t('profile.friends', { n: data.friends.length }) }}
          </p>

          <ul v-if="data.friends.length" class="mt-3 flex flex-wrap gap-2">
            <li v-for="f in data.friends" :key="f.id">
              <NuxtLink
                :to="localePath(`/u/${f.username}`)"
                class="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] py-1 pr-3.5 pl-1 text-sm font-medium text-white/85 no-underline transition hover:border-[rgba(125,211,252,.4)] hover:bg-white/[0.07]"
              >
                <img v-if="f.image" :src="f.image" alt="" class="size-7 rounded-full object-cover">
                <span
                  v-else
                  class="flex size-7 items-center justify-center rounded-full text-[11px] font-bold"
                  :style="`background:hsl(${initialsAvatar(label(f)).hue} 60% 30%)`"
                >{{ initialsAvatar(label(f)).letter }}</span>
                {{ label(f) }}
              </NuxtLink>
            </li>
          </ul>

          <div v-else class="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-7 text-center">
            <p class="text-sm text-white/35">{{ $t('profile.noFriends') }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
