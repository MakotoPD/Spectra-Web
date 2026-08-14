// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Server-only secrets. Set via env in prod:
  //   ADMIN_TOKEN          — password for /admin
  //   SPECTRA_INGEST_KEY   — optional soft key the launcher sends (anti-spam)
  //   DATABASE_URL         — Postgres; every table lives there
  //   BETTER_AUTH_SECRET   — session/token signing secret (required in prod)
  //   RESEND_API_KEY, MAIL_FROM — transactional mail; without it verification
  //                          and reset links are only printed to the server log
  //   DISCORD_/GOOGLE_/GITHUB_/MICROSOFT_CLIENT_ID + _CLIENT_SECRET — OAuth,
  //                          each provider appears on the sign-in page only
  //                          once both of its values are set. Callback URL is
  //                          <site>/api/auth/callback/<provider>.
  //   R2_* — Cloudflare R2 bucket for avatar uploads (see .env.example)
  //   TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY — captcha on sign-up/-in/reset
  runtimeConfig: {
    adminToken: process.env.ADMIN_TOKEN || '',
    ingestKey: process.env.SPECTRA_INGEST_KEY || '',
    public: {
      // Canonical site origin — used for canonical/og:url, hreflang, sitemap & robots.
      // Override per-environment with NUXT_PUBLIC_SITE_URL.
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://spectra.makoto.com.pl',
    },
  },

  // The fonts are loaded from Google with a <link> in `app.head` below. @nuxt/ui
  // also pulls in @nuxt/fonts, which would download and self-host the same
  // families during the build — a network call that has already broken a deploy
  // when Google rotated a file URL and the cached one started returning 404.
  fonts: {
    providers: {
      google: false,
    },
  },

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
    // Default locale (en) stays at /, other locales get a prefix (/pl) so each
    // language has its own indexable URL + automatic hreflang alternates.
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://spectra.makoto.com.pl',
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
      meta: [
        { name: 'theme-color', content: '#05080f' }
      ],
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
