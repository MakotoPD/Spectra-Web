<script setup lang="ts">
const { t, locale } = useI18n()

useHead({
  htmlAttrs: {
    lang: locale,
    class: 'dark'
  }
})

useSeoMeta({
  title: () => t('meta.title'),
  description: () => t('meta.description'),
  ogTitle: () => t('meta.title'),
  ogDescription: () => t('meta.description'),
  ogType: 'website',
  ogImage: '/logo.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <div
      class="relative min-h-screen overflow-hidden text-[#eaf1fb] antialiased"
      style="background:radial-gradient(1200px 700px at 75% -5%,rgba(14,165,233,.16),transparent 60%),radial-gradient(900px 600px at 10% 8%,rgba(34,211,238,.08),transparent 55%),#05080f"
    >
      <AppHeader />
      <main>
        <NuxtPage />
      </main>
      <AppFooter />
    </div>
  </UApp>
</template>
