<script setup lang="ts">
const { t } = useI18n()

const icons: Record<string, string> = {
  stack: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
  puzzle: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7V5a2 2 0 0 0-4 0v2H7a1 1 0 0 0-1 1v3H4a2 2 0 0 0 0 4h2v3a1 1 0 0 0 1 1h3v-2a2 2 0 0 1 4 0v2h3a1 1 0 0 0 1-1v-3h2a2 2 0 0 0 0-4h-2V8a1 1 0 0 0-1-1h-3Z"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/></svg>',
  globe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  bolt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  palette: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0 0 18 2.5 2.5 0 0 0 2.5-2.5c0-.7-.3-1.3-.7-1.7-.4-.4-.6-.9-.6-1.5A2.3 2.3 0 0 1 15.5 13H17a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="9.5" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>'
}

const features = [
  { key: 'instances', icon: 'stack', accent: '#22d3ee', tbg: 'rgba(34,211,238,.13)', tbd: 'rgba(34,211,238,.32)' },
  { key: 'mods', icon: 'puzzle', accent: '#38bdf8', tbg: 'rgba(56,189,248,.13)', tbd: 'rgba(56,189,248,.32)' },
  { key: 'skins', icon: 'user', accent: '#60a5fa', tbg: 'rgba(96,165,250,.13)', tbd: 'rgba(96,165,250,.32)' },
  { key: 'worlds', icon: 'globe', accent: '#818cf8', tbg: 'rgba(129,140,248,.14)', tbd: 'rgba(129,140,248,.34)' },
  { key: 'fast', icon: 'bolt', accent: '#a78bfa', tbg: 'rgba(167,139,250,.14)', tbd: 'rgba(167,139,250,.34)' },
  { key: 'themes', icon: 'palette', accent: '#f472b6', tbg: 'rgba(244,114,182,.13)', tbd: 'rgba(244,114,182,.32)' }
] as const
</script>

<template>
  <section
    id="features"
    class="relative z-[2] border-t border-white/5"
    style="padding:clamp(40px,6vw,80px) clamp(18px,4vw,48px)"
  >
    <div data-reveal class="mx-auto mb-11 max-w-[760px] text-center">
      <SectionEyebrow>{{ t('features.eyebrow') }}</SectionEyebrow>
      <h2
        class="font-display"
        style="font-weight:700;font-size:clamp(26px,3.6vw,42px);letter-spacing:-.02em;margin:0 0 14px"
      >{{ t('features.heading') }}</h2>
      <p style="font-size:16.5px;line-height:1.55;color:#9fb0c8;margin:0">{{ t('features.subheading') }}</p>
    </div>

    <div
      class="mx-auto grid max-w-[1120px] gap-[18px]"
      style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))"
    >
      <div
        v-for="f in features"
        :key="f.key"
        data-reveal
        class="relative rounded-[16px] border border-white/[0.07] p-[26px] transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(125,211,252,.35)] hover:shadow-[0_18px_40px_-22px_rgba(56,189,248,.6)]"
        style="background:linear-gradient(180deg,rgba(18,27,46,.7),rgba(10,15,26,.7))"
      >
        <div
          class="mb-[18px] flex h-[46px] w-[46px] items-center justify-center rounded-[12px] border"
          :style="`background:${f.tbg};border-color:${f.tbd};color:${f.accent}`"
          v-html="icons[f.icon]"
        />
        <h3 class="font-display" style="font-weight:600;font-size:19px;margin:0 0 9px">
          {{ t(`features.items.${f.key}.title`) }}
        </h3>
        <p style="font-size:14.5px;line-height:1.55;color:#93a4bd;margin:0">
          {{ t(`features.items.${f.key}.desc`) }}
        </p>
      </div>
    </div>
  </section>
</template>
