<script setup lang="ts">
const { t } = useI18n()
const { data: release } = useLauncherVersion()
const os = useOs()

const primaryHref = computed(() => release.value?.releasesUrl || GITHUB_REPO)
</script>

<template>
  <section class="relative z-[2] py-24">
    <div class="mx-auto max-w-[1120px] px-[clamp(18px,4vw,48px)]">
      <div
        data-reveal
        class="relative overflow-hidden rounded-3xl border border-white/10 px-6 py-16 text-center sm:px-16"
        style="background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.01))"
      >
        <!-- grid pattern -->
        <div
          class="pointer-events-none absolute inset-0"
          style="background-image:linear-gradient(to right,rgba(56,189,248,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(56,189,248,.06) 1px,transparent 1px);background-size:40px 40px;-webkit-mask-image:radial-gradient(ellipse 60% 60% at 50% 50%,#000,transparent);mask-image:radial-gradient(ellipse 60% 60% at 50% 50%,#000,transparent)"
        />
        <!-- glow -->
        <div
          class="pointer-events-none absolute left-1/2 top-0 h-64 w-[40rem] -translate-x-1/2 rounded-full"
          style="background:radial-gradient(circle,rgba(56,189,248,.2),transparent 70%);filter:blur(100px)"
        />

        <div class="relative">
          <h2 class="font-display text-4xl font-bold tracking-tight sm:text-5xl">{{ t('cta.heading') }}</h2>
          <p class="mx-auto mt-4 max-w-xl text-lg" style="color:#9fb0c8">{{ t('cta.subheading') }}</p>
          <div class="mt-8 flex justify-center">
            <a
              :href="primaryHref"
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-[11px] rounded-[13px] px-7 py-[15px] text-[16px] font-bold no-underline transition-transform hover:-translate-y-0.5"
              style="color:#04121f;background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 12px 36px rgba(56,189,248,.4)"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></svg>
              {{ t('cta.download', { os }) }}
            </a>
          </div>
          <p v-if="release?.version" class="mt-4 font-mono text-sm" style="color:#6f819b">v{{ release.version }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
