// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],
  modules: [
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxtjs/i18n'
  ],

  // Dark mode only — force the dark color scheme, no toggle.
  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  content: {
    experimental: { nativeSqlite: true }
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    bundle: { optimizeTranslationDirective: false },
    locales: [
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' },
      { code: 'pl', name: 'Polski', language: 'pl-PL', file: 'pl.json' }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'spectra_lang',
      redirectOn: 'root'
    }
  },

  app: {
    head: {
      htmlAttrs: { class: 'dark' },
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap'
        }
      ]
    }
  }
})
