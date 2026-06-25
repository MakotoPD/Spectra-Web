<script setup lang="ts">
const { t } = useI18n()
const { data: release } = useLauncherVersion()

const year = new Date().getFullYear()
const versionLabel = computed(() => (release.value?.version ? `v${release.value.version}` : ''))

const product = computed(() => [
  { label: t('footer.links.features'), href: '#features' },
  { label: t('footer.links.loaders'), href: '#loaders' },
  { label: t('footer.links.download'), href: '#download' }
])

const resources = computed(() => [
  { label: t('footer.links.github'), href: GITHUB_REPO, external: true },
  { label: t('footer.links.bug'), href: `${GITHUB_REPO}/issues`, external: true },
  { label: t('footer.links.releases'), href: release.value?.releasesUrl || `${GITHUB_REPO}/releases/latest`, external: true },
  { label: t('footer.links.faq'), href: '#faq' }
])
</script>

<template>
  <footer
    class="relative z-[2] border-t border-white/[0.06]"
    style="padding:clamp(40px,5vw,64px) clamp(18px,4vw,48px) 40px;background:rgba(5,8,15,.6)"
  >
    <div class="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-10">
      <div class="max-w-[320px]">
        <div class="mb-3.5 flex items-center gap-[11px]">
          <img src="/logo.png" alt="Spectra" width="28" height="28" style="filter:drop-shadow(0 0 8px rgba(56,189,248,.5))" >
          <span class="font-display" style="font-weight:600;font-size:17px">Spectra Launcher</span>
        </div>
        <p style="font-size:14px;line-height:1.55;color:#7d8ea7;margin:0 0 16px">{{ t('footer.tagline') }}</p>
        <div class="font-mono" style="font-size:12px;color:#5f6f87">{{ t('footer.license', { version: versionLabel }) }}</div>
      </div>

      <div class="flex flex-wrap" style="gap:clamp(32px,5vw,72px)">
        <div>
          <div class="mb-3.5 uppercase" style="font-size:13px;font-weight:700;color:#cfdcec;letter-spacing:.08em">{{ t('footer.product') }}</div>
          <div class="flex flex-col gap-2.5 text-[14px]">
            <a
              v-for="link in product"
              :key="link.label"
              :href="link.href"
              class="no-underline transition-colors hover:text-[#7dd3fc]"
              style="color:#8a9bb4"
            >{{ link.label }}</a>
          </div>
        </div>
        <div>
          <div class="mb-3.5 uppercase" style="font-size:13px;font-weight:700;color:#cfdcec;letter-spacing:.08em">{{ t('footer.resources') }}</div>
          <div class="flex flex-col gap-2.5 text-[14px]">
            <a
              v-for="link in resources"
              :key="link.label"
              :href="link.href"
              :target="link.external ? '_blank' : undefined"
              :rel="link.external ? 'noreferrer' : undefined"
              class="no-underline transition-colors hover:text-[#7dd3fc]"
              style="color:#8a9bb4"
            >{{ link.label }}</a>
          </div>
        </div>
      </div>
    </div>

    <div
      class="mx-auto mt-9 flex max-w-[1120px] flex-wrap items-center justify-between gap-3.5 border-t border-white/[0.06] pt-6"
      style="font-size:13px;color:#5f6f87"
    >
      <span>{{ t('footer.legalLeft', { year }) }}</span>
      <span>{{ t('footer.legalRight') }}</span>
    </div>
  </footer>
</template>
