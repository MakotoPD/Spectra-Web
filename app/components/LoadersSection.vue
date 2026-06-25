<script setup lang="ts">
const { t } = useI18n()

const loaders = [
  { key: 'fabric',   name: 'Fabric',   bg: 'rgba(199,179,153,.16)', fg: '#dcc7a8' },
  { key: 'forge',    name: 'Forge',    bg: 'rgba(168, 56, 56, 0.18)',  fg: '#E87F7F' },
  { key: 'neoforge', name: 'NeoForge', bg: 'rgba(232,138,69,.16)',  fg: '#f0a368' },
  { key: 'quilt',    name: 'Quilt',    bg: 'rgba(157,109,214,.18)', fg: '#c2a0ec' },
  { key: 'vanilla',  name: 'Vanilla',  bg: 'rgba(120,180,120,.16)', fg: '#9bd6a0' }
] as const

// Map each loader key to its auto-imported icon component.
const iconMap = {
  fabric:   resolveComponent('IconFabric'),
  forge:    resolveComponent('IconForge'),
  neoforge: resolveComponent('IconNeoforge'),
  quilt:    resolveComponent('IconQuilt'),
  vanilla:  resolveComponent('IconVanilla'),
} as const
</script>

<template>
  <section
    id="loaders"
    class="relative z-[2]"
    style="padding:clamp(40px,6vw,80px) clamp(18px,4vw,48px)"
  >
    <div
      class="mx-auto max-w-[1120px] rounded-[22px] border border-white/[0.07]"
      style="background:radial-gradient(700px 300px at 50% 0%,rgba(56,189,248,.1),transparent 70%),linear-gradient(180deg,rgba(14,21,36,.8),rgba(8,12,21,.8));padding:clamp(30px,5vw,56px)"
    >
      <div data-reveal class="mb-[34px] text-center">
        <SectionEyebrow>{{ t('loaders.eyebrow') }}</SectionEyebrow>
        <h2
          class="font-display"
          style="font-weight:700;font-size:clamp(24px,3.2vw,38px);letter-spacing:-.02em;margin:0 0 10px"
        >{{ t('loaders.heading') }}</h2>
        <p style="font-size:16px;color:#9fb0c8;margin:0">{{ t('loaders.subheading') }}</p>
      </div>

      <div
        class="grid gap-3.5"
        style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"
      >
        <div
          v-for="l in loaders"
          :key="l.key"
          data-reveal
          class="flex flex-col items-center gap-3 rounded-[14px] border border-white/[0.08] px-4 py-6 transition-all duration-300 hover:-translate-y-[3px] hover:border-[rgba(125,211,252,.4)]"
          style="background:rgba(255,255,255,.02)"
        >
          <div
            class="flex h-[52px] w-[52px] items-center justify-center rounded-[13px]"
            :style="`background:${l.bg};color:${l.fg};box-shadow:0 6px 18px -8px ${l.fg}`"
          >
            <component :is="iconMap[l.key]" class="h-7 w-7" />
          </div>
          <div style="font-weight:600;font-size:16px">{{ l.name }}</div>
          <div class="font-mono" style="font-size:11.5px;color:#6f819b">{{ t(`loaders.notes.${l.key}`) }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
