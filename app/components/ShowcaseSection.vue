<script setup lang="ts">
const { t } = useI18n()

const shots = [
  { key: 'home', src: '/screenshots/MainMenu.png', w: 1345, h: 686 },
  { key: 'mods', src: '/screenshots/InstanceScreen.png', w: 1345, h: 686 },
  { key: 'skins', src: '/screenshots/SkinsScreen.png', w: 1372, h: 762 },
  { key: 'worlds', src: '/screenshots/WorldsScreen.png', w: 1372, h: 762 },
  { key: 'settings', src: '/screenshots/Settings.png', w: 1345, h: 686 }
] as const

const active = ref(0)
const current = computed(() => shots[active.value]!)
</script>

<template>
  <section
    id="screenshots"
    class="relative z-[2]"
    style="padding:clamp(30px,5vw,60px) clamp(18px,4vw,48px) clamp(50px,7vw,90px)"
  >
    <div data-reveal class="mx-auto mb-7 max-w-[1120px] text-center">
      <SectionEyebrow>{{ t('showcase.eyebrow') }}</SectionEyebrow>
      <h2
        class="font-display"
        style="font-weight:700;font-size:clamp(26px,3.4vw,40px);letter-spacing:-.02em;margin:0"
      >{{ t('showcase.heading') }}</h2>
    </div>

    <!-- Tabs -->
    <div data-reveal class="mx-auto mb-[22px] flex max-w-[1000px] flex-wrap justify-center gap-2">
      <button
        v-for="(shot, i) in shots"
        :key="shot.key"
        type="button"
        class="cursor-pointer rounded-[10px] px-4 py-[9px] text-[14px] font-semibold transition-all"
        :style="i === active
          ? 'color:#04121f;background:linear-gradient(135deg,#7dd3fc,#38bdf8);border:1px solid transparent'
          : 'color:#aab9d0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)'"
        @click="active = i"
      >{{ t(`showcase.tabs.${shot.key}`) }}</button>
    </div>

    <!-- Active screenshot -->
    <div data-reveal class="relative mx-auto max-w-[1080px]">
      <div
        style="position:absolute;inset:-1px;border-radius:18px;background:linear-gradient(135deg,rgba(56,189,248,.5),rgba(34,211,238,.1) 50%,transparent);filter:blur(2px);opacity:.7"
      />
      <div
        style="position:relative;border-radius:16px;overflow:hidden;border:1px solid rgba(125,211,252,.2);box-shadow:0 40px 90px -30px rgba(2,16,33,.9),0 0 60px rgba(56,189,248,.12);background:#0a0f1b"
      >
        <NuxtImg
          :key="current.src"
          :src="current.src"
          :alt="`Spectra Launcher — ${t(`showcase.tabs.${current.key}`)}`"
          :width="current.w"
          :height="current.h"
          sizes="sm:100vw lg:1080px"
          format="webp"
          quality="80"
          loading="lazy"
          style="display:block;width:100%;height:auto"
        />
      </div>
    </div>
  </section>
</template>
