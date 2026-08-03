<script setup lang="ts">
// Landing page for a launcher share code. Its only job is to bounce the visitor
// into the desktop app via the `spectra://` deep link — everything else on the
// page is a fallback for people who don't have the launcher yet.

interface ShareMeta {
  code: string
  created: number
  expires: number
  name: string | null
  mc_version: string | null
  loader: string | null
  mods: number
  size: number
  downloads: number
}

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const code = String(route.params.code || '').toUpperCase()

const { data: meta, error } = await useFetch<ShareMeta>(`/api/share/${code}`, {
  query: { meta: 1 },
})

const deepLink = computed(() => `spectra://share/${code}`)
const expiresIn = computed(() => {
  if (!meta.value) return ''
  const days = Math.max(0, Math.ceil((meta.value.expires - Date.now()) / 86_400_000))
  return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(days, 'day')
})
const prettySize = computed(() => {
  const kb = (meta.value?.size ?? 0) / 1024
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`
})

// Share links are per-person and short-lived — keep them out of the index.
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
useSeoMeta({
  title: () => (meta.value ? t('share.metaTitle', { name: meta.value.name }) : t('share.notFoundTitle')),
  description: () => t('share.metaDescription'),
})

const opening = ref(false)
function openInLauncher() {
  opening.value = true
  window.location.href = deepLink.value
  setTimeout(() => (opening.value = false), 3000)
}
</script>

<template>
  <section class="mx-auto max-w-xl px-4 pt-28 pb-24">
    <!-- expired / unknown code -->
    <UCard v-if="error || !meta">
      <div class="py-6 text-center">
        <UIcon name="i-lucide-link-2-off" class="mx-auto size-10 text-white/30" />
        <h1 class="mt-4 text-xl font-bold">{{ $t('share.notFoundTitle') }}</h1>
        <p class="mt-2 text-sm text-white/60">{{ $t('share.notFoundDesc') }}</p>
        <UButton class="mt-6" color="neutral" variant="soft" :to="localePath('/')" :label="$t('share.backHome')" />
      </div>
    </UCard>

    <UCard v-else>
      <div class="text-center">
        <p class="text-xs font-medium tracking-widest text-primary-400 uppercase">{{ $t('share.eyebrow') }}</p>
        <h1 class="mt-2 text-2xl font-bold tracking-tight">{{ meta.name }}</h1>

        <div class="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span v-if="meta.mc_version" class="rounded-full bg-white/8 px-2.5 py-1">{{ meta.mc_version }}</span>
          <span v-if="meta.loader" class="rounded-full bg-white/8 px-2.5 py-1 capitalize">{{ meta.loader }}</span>
          <span class="rounded-full bg-white/8 px-2.5 py-1">{{ $t('share.modCount', { n: meta.mods }) }}</span>
        </div>

        <div class="mt-6 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <p class="text-[11px] tracking-wider text-white/40 uppercase">{{ $t('share.codeLabel') }}</p>
          <p class="mt-1 font-mono text-3xl font-bold tracking-[0.35em]">{{ meta.code }}</p>
        </div>

        <UButton
          class="mt-6"
          size="lg"
          block
          icon="i-lucide-rocket"
          :loading="opening"
          :label="$t('share.openBtn')"
          @click="openInLauncher"
        />
        <p class="mt-3 text-xs text-white/45">{{ $t('share.openHint') }}</p>

        <div class="mt-6 space-y-2 border-t border-white/10 pt-5 text-sm">
          <p class="text-white/60">{{ $t('share.noLauncher') }}</p>
          <UButton color="neutral" variant="soft" icon="i-lucide-download" :to="localePath('/')" :label="$t('share.getLauncher')" />
        </div>

        <p class="mt-6 text-[11px] text-white/35">
          {{ $t('share.footerMeta', { size: prettySize, downloads: meta.downloads, expires: expiresIn }) }}
        </p>
      </div>
    </UCard>
  </section>
</template>
