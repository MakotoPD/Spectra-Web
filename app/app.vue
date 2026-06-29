<script setup lang="ts">
const { t, locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const { data: release } = useLauncherVersion()

const siteUrl = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')
const ogImageUrl = `${siteUrl}/og.webp`

// Absolute URL of the current page in a given locale (prefix_except_default).
const localeUrl = (code: string) => `${siteUrl}${switchLocalePath(code as 'en' | 'pl') || '/'}`
const canonical = computed(() => localeUrl(locale.value))
const ogLocale = computed(() =>
  (locales.value as { code: string, language: string }[])
    .find(l => l.code === locale.value)?.language.replace('-', '_') || 'en_US'
)

useHead(() => ({
  htmlAttrs: {
    lang: locale.value,
    class: 'dark'
  },
  link: [
    { rel: 'canonical', href: canonical.value },
    // hreflang alternates for each locale + x-default → English.
    ...(locales.value as { code: string, language: string }[]).map(l => ({
      rel: 'alternate',
      hreflang: l.language,
      href: localeUrl(l.code)
    })),
    { rel: 'alternate', hreflang: 'x-default', href: localeUrl('en') }
  ]
}))

useSeoMeta({
  title: () => t('meta.title'),
  description: () => t('meta.description'),
  ogTitle: () => t('meta.title'),
  ogDescription: () => t('meta.description'),
  ogType: 'website',
  ogSiteName: 'Spectra Launcher',
  ogUrl: () => canonical.value,
  ogImage: ogImageUrl,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => t('meta.title'),
  ogLocale: () => ogLocale.value,
  twitterCard: 'summary_large_image',
  twitterTitle: () => t('meta.title'),
  twitterDescription: () => t('meta.description'),
  twitterImage: ogImageUrl
})

// Structured data (Schema.org) — helps Google rich results and gives generative
// engines an unambiguous, machine-readable description of the product.
useHead(() => ({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `${siteUrl}/#organization`,
            name: 'Spectra Launcher',
            url: siteUrl,
            logo: `${siteUrl}/logo.png`,
            sameAs: ['https://github.com/MakotoPD/Spectra-Launcher']
          },
          {
            '@type': 'WebSite',
            '@id': `${siteUrl}/#website`,
            name: 'Spectra Launcher',
            url: siteUrl,
            inLanguage: locale.value,
            publisher: { '@id': `${siteUrl}/#organization` }
          },
          {
            '@type': 'SoftwareApplication',
            '@id': `${siteUrl}/#app`,
            name: 'Spectra Launcher',
            description: t('meta.description'),
            url: siteUrl,
            applicationCategory: 'GameApplication',
            operatingSystem: 'Windows, macOS, Linux',
            ...(release.value?.version ? { softwareVersion: release.value.version } : {}),
            downloadUrl: release.value?.releasesUrl || 'https://github.com/MakotoPD/Spectra-Launcher/releases/latest',
            license: 'https://opensource.org/licenses/MIT',
            image: ogImageUrl,
            screenshot: `${siteUrl}/screenshots/MainMenu.png`,
            author: { '@id': `${siteUrl}/#organization` },
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD'
            }
          }
        ]
      })
    }
  ]
}))
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
