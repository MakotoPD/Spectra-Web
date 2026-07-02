<script setup lang="ts">
import { gsap } from 'gsap'

const { t } = useI18n()
const { data: release } = useLauncherVersion()
const os = useOs()

// Pick the best direct download for the visitor's OS.
// Falls back to the releases page while the API is loading or on error.
const primaryHref = computed(() => {
  const dl = release.value?.downloads
  const fallback = release.value?.releasesUrl || GITHUB_REPO
  if (!dl) return fallback
  if (os.value === 'macOS') return dl.macArm
  if (os.value === 'Linux') return dl.linuxAppImage
  return dl.winInstaller // Windows (default)
})

const root = ref<HTMLElement>()
let ctx: gsap.Context | undefined

onMounted(() => {
  if (!root.value) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  ctx = gsap.context(() => {
    if (reduce) {
      gsap.set('[data-hero],[data-hero-art]', { opacity: 1, y: 0, scale: 1 })
      return
    }
    gsap.fromTo(
      '[data-hero]',
      { y: 26, opacity: 0 },
      { opacity: 1, y: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out', delay: 0.1 }
    )
    gsap.fromTo(
      '[data-hero-art]',
      { scale: 0.82, opacity: 0 },
      { opacity: 1, scale: 1, duration: 1.1, ease: 'power3.out', delay: 0.25 }
    )
  }, root.value)
})

onUnmounted(() => ctx?.revert())
</script>

<template>
  <header
    id="top"
    ref="root"
    class="relative"
    style="padding:clamp(56px,9vw,120px) clamp(18px,4vw,48px) clamp(40px,6vw,80px)"
  >
    <!-- Grid ambient background (heroStyle: grid) -->
    <div aria-hidden="true" class="absolute inset-0 z-0 overflow-hidden" style="pointer-events:none">
      <div
        style="position:absolute;inset:-2px 0 0;height:90%;background-image:linear-gradient(rgba(56,189,248,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.14) 1px,transparent 1px);background-size:88px 88px;-webkit-mask-image:radial-gradient(120% 80% at 50% 0%,#000 30%,transparent 75%);mask-image:radial-gradient(120% 80% at 50% 0%,#000 30%,transparent 75%);animation:spectragrid 4s linear infinite"
      />
      <div
        style="position:absolute;top:-140px;right:14%;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,.4),transparent 65%);filter:blur(50px)"
      />
    </div>

    <!-- Prism dispersion beam -->
    <div
      aria-hidden="true"
      style="position:absolute;top:-6%;left:46%;width:60%;height:150%;z-index:1;pointer-events:none;transform:rotate(18deg);transform-origin:top left;opacity:.5;filter:blur(8px);background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.5) 6%,rgba(56,189,248,.5) 16%,rgba(34,211,238,.45) 30%,rgba(52,211,153,.4) 44%,rgba(250,204,21,.32) 58%,rgba(244,114,182,.4) 72%,rgba(167,139,250,.42) 86%,transparent 100%)"
    />

    <div
      class="relative z-[2] mx-auto flex max-w-[1280px] flex-wrap items-center"
      style="gap:clamp(28px,3vw,40px)"
    >
      <!-- Copy -->
      <div style="flex:1 1 380px;min-width:280px">
        <div
          data-hero
          class="mb-7 inline-flex items-center gap-[9px] rounded-full border py-1.5 pl-2 pr-[13px] font-mono text-[12.5px]"
          style="border-color:rgba(125,211,252,.28);background:rgba(56,189,248,.08);color:#bfe6ff"
        >
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-[9px] py-0.5 font-semibold"
            style="background:rgba(52,211,153,.16);color:#6ee7b7"
          >
            <span
              style="width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;animation:spectrapulse 2s infinite"
            />
            v{{ release?.version || '…' }}
          </span>
          {{ t('hero.badgeFree') }}
        </div>

        <h1
          data-hero
          class="font-display"
          style="font-weight:700;font-size:clamp(48px,7.4vw,96px);line-height:.92;letter-spacing:-.045em;margin:0 0 24px"
        >
          <span class="block" style="color:#f1f6fd;text-shadow:2px 0 rgba(244,114,182,.28),-2px 0 rgba(56,189,248,.32)">{{ t('hero.title1') }}</span>
          <span class="block" style="color:#f1f6fd;text-shadow:2px 0 rgba(244,114,182,.28),-2px 0 rgba(56,189,248,.32)">{{ t('hero.title2') }}</span>
          <span
            class="block"
            style="background:linear-gradient(96deg,#7dd3fc,#38bdf8 28%,#22d3ee 52%,#a78bfa 86%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 6px 26px rgba(56,189,248,.35))"
          >{{ t('hero.title3') }}</span>
        </h1>

        <p
          data-hero
          style="font-size:clamp(16px,1.55vw,19px);line-height:1.55;color:#9fb0c8;max-width:480px;margin:0 0 32px"
        >{{ t('hero.subtitle') }}</p>

        <div data-hero class="mb-5 flex flex-wrap items-center gap-3.5">
          <a
            :href="primaryHref"
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-[11px] rounded-[13px] px-[26px] py-[15px] text-[16px] font-bold no-underline transition-transform hover:-translate-y-0.5"
            style="color:#04121f;background:linear-gradient(135deg,#7dd3fc,#38bdf8 55%,#0ea5e9);box-shadow:0 10px 34px rgba(56,189,248,.38)"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></svg>
            {{ t('hero.downloadFor', { os }) }}
          </a>
          <a
            href="#download"
            class="inline-flex items-center gap-[9px] rounded-[13px] border border-white/[0.14] px-[22px] py-[15px] text-[16px] font-semibold no-underline transition-colors hover:border-[rgba(125,211,252,.45)]"
            style="color:#eaf1fb;background:rgba(255,255,255,.03)"
          >{{ t('hero.allPlatforms') }}</a>
        </div>

        <div data-hero class="flex items-center gap-3.5" style="color:#6f819b;font-size:13.5px">
          <span class="inline-flex items-center gap-[7px]"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5 10 4v7.5H3V5.5Zm0 13L10 20v-7.3H3V18.5ZM11 3.8 21 2v9.5H11V3.8Zm0 16.4L21 22v-9.4H11v7.6Z" /></svg>Windows</span>
          <span class="inline-flex items-center gap-[7px]"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8ZM14.1 5c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" /></svg>macOS</span>
          <span class="inline-flex items-center gap-[7px]"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-1.7 0-3 1.4-3 3.2 0 1 .1 2.2-.5 3.4-.7 1.3-2 2.4-2 4.7 0 .9.3 1.7.7 2.4-.5.4-.9 1-.9 1.8 0 1.5 1.4 2.3 3.2 2.7 1 .2 1.8.9 2.5.9s1.5-.7 2.5-.9c1.8-.4 3.2-1.2 3.2-2.7 0-.8-.4-1.4-.9-1.8.4-.7.7-1.5.7-2.4 0-2.3-1.3-3.4-2-4.7-.6-1.2-.5-2.4-.5-3.4C15 3.4 13.7 2 12 2Z" /></svg>Linux</span>
          <span style="color:#3f4d63">·</span>
          <span class="font-mono">GPLv3</span>
        </div>
      </div>

      <!-- Tilted product window -->
      <div
        class="relative flex items-center justify-end"
        style="flex:1 1 460px;min-width:300px;perspective:1800px"
      >
        <div
          data-hero-art
          style="position:relative;width:min(112%,820px);margin-right:clamp(-130px,-6vw,-24px);transform:rotateY(-17deg) rotateX(5deg) rotate(.6deg);transform-style:preserve-3d"
        >
          <div
            aria-hidden="true"
            style="position:absolute;inset:-14% -10%;border-radius:30px;background:conic-gradient(from 200deg,rgba(34,211,238,.5),rgba(56,189,248,.4),rgba(167,139,250,.45),rgba(244,114,182,.35),rgba(34,211,238,.5));filter:blur(50px);opacity:.55;z-index:0"
          />
          <div
            style="position:relative;z-index:1;border-radius:14px;overflow:hidden;border:1px solid rgba(125,211,252,.22);box-shadow:0 50px 120px -40px rgba(0,0,0,.9),0 0 0 1px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)"
          >
            <NuxtImg
              src="/screenshots/MainMenu.png"
              alt="Spectra Launcher home screen"
              width="1345"
              height="686"
              sizes="sm:100vw md:60vw lg:820px"
              format="webp"
              quality="80"
              fetchpriority="high"
              loading="eager"
              style="display:block;width:100%;height:auto"
            />
          </div>
          <!-- Floating secondary card -->
          <div
            aria-hidden="true"
            style="position:absolute;z-index:2;left:-13%;bottom:-12%;width:38%;border-radius:11px;overflow:hidden;border:1px solid rgba(167,139,250,.3);box-shadow:0 30px 70px -28px rgba(0,0,0,.95);transform:rotate(-3deg);animation:spectrafloat 7s ease-in-out infinite"
          >
            <NuxtImg
              src="/screenshots/SkinsScreen.png"
              alt=""
              width="1372"
              height="762"
              sizes="sm:40vw lg:320px"
              format="webp"
              quality="75"
              loading="lazy"
              style="display:block;width:100%;height:auto"
            />
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
