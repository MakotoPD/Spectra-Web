<script setup lang="ts">
const { t } = useI18n()
const { data: release } = useLauncherVersion()

const nav = computed(() => [
  { label: t('nav.features'), to: '#features' },
  { label: t('nav.loaders'), to: '#loaders' },
  { label: t('nav.download'), to: '#download' },
  { label: t('nav.faq'), to: '#faq' }
])
</script>

<template>
  <nav
    class="sticky top-0 z-50 flex items-center justify-between gap-6 border-b border-white/[0.06] px-[clamp(18px,4vw,48px)] py-4 backdrop-blur-[14px]"
    style="background:rgba(5,8,15,.55)"
  >
    <!-- Brand -->
    <a href="#top" class="flex items-center gap-[11px] no-underline">
      <img
        src="/logo.png"
        alt="Spectra"
        width="30"
        height="30"
        style="filter:drop-shadow(0 0 10px rgba(56,189,248,.5))"
      >
      <span class="font-display text-[18px] font-semibold tracking-[-0.01em]">
        Spectra<span style="color:#7dd3fc"> Launcher</span>
      </span>
      <span
        v-if="release?.version"
        class="ml-1 hidden rounded-full border px-2 py-0.5 font-mono text-[11px] sm:inline-block"
        style="border-color:rgba(125,211,252,.28);background:rgba(56,189,248,.08);color:#bfe6ff"
      >v{{ release.version }}</span>
    </a>

    <!-- Nav links -->
    <div class="hidden items-center gap-1.5 md:flex">
      <a
        v-for="link in nav"
        :key="link.to"
        :href="link.to"
        class="rounded-[9px] px-[14px] py-2 text-[14px] font-medium no-underline transition-colors hover:bg-white/5"
        style="color:#aab9d0"
      >{{ link.label }}</a>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2.5">
      <LangSwitcher />
      <a
        :href="GITHUB_REPO"
        target="_blank"
        rel="noreferrer"
        class="hidden items-center gap-2 rounded-[10px] border border-white/[0.12] px-[14px] py-[9px] text-[14px] font-semibold no-underline transition-colors hover:border-[rgba(125,211,252,.5)] sm:inline-flex"
        style="color:#dbe6f5;background:rgba(255,255,255,.03)"
      >
        <UIcon name="i-simple-icons-github" class="h-[17px] w-[17px]" />
        GitHub
      </a>
      <a
        href="#download"
        class="inline-flex items-center gap-2 rounded-[10px] px-4 py-[9px] text-[14px] font-bold no-underline transition-transform hover:-translate-y-px"
        style="color:#04121f;background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 6px 22px rgba(56,189,248,.32)"
      >{{ t('nav.download') }}</a>
    </div>
  </nav>
</template>
