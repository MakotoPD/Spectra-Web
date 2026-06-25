<script setup lang="ts">
const { t } = useI18n()

const keys = ['free', 'platforms', 'java', 'loaders', 'mods', 'account'] as const

const items = computed(() =>
  keys.map(k => ({
    label: t(`faq.items.${k}.q`),
    content: t(`faq.items.${k}.a`)
  }))
)
</script>

<template>
  <section id="faq" class="relative z-[2] border-t border-white/5 py-24">
    <div class="mx-auto max-w-3xl px-[clamp(18px,4vw,48px)]">
      <div v-reveal class="mx-auto max-w-2xl text-center">
        <SectionEyebrow>{{ t('faq.eyebrow') }}</SectionEyebrow>
        <h2 class="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {{ t('faq.heading') }}
        </h2>
      </div>

      <UAccordion
        v-reveal="{ y: 20 }"
        :items="items"
        type="single"
        collapsible
        class="mt-12"
        :ui="{ item: 'border-b border-white/8 py-1' }"
      />
    </div>
  </section>
</template>
