<script setup lang="ts">
const { t } = useI18n()
const { data: release } = useLauncherVersion()

const icons: Record<string, string> = {
  win: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5 10 4v7.5H3V5.5Zm0 13L10 20v-7.3H3V18.5ZM11 3.8 21 2v9.5H11V3.8Zm0 16.4L21 22v-9.4H11v7.6Z"/></svg>',
  apple: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8ZM14.1 5c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z"/></svg>',
  linux: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-1.7 0-3 1.4-3 3.2 0 1 .1 2.2-.5 3.4-.7 1.3-2 2.4-2 4.7 0 .9.3 1.7.7 2.4-.5.4-.9 1-.9 1.8 0 1.5 1.4 2.3 3.2 2.7 1 .2 1.8.9 2.5.9s1.5-.7 2.5-.9c1.8-.4 3.2-1.2 3.2-2.7 0-.8-.4-1.4-.9-1.8.4-.7.7-1.5.7-2.4 0-2.3-1.3-3.4-2-4.7-.6-1.2-.5-2.4-.5-3.4C15 3.4 13.7 2 12 2Z"/></svg>'
}

// Each build now carries a computed `href` pointing directly to the file.
const platforms = computed(() => {
  const dl = release.value?.downloads
  const fallback = release.value?.releasesUrl || GITHUB_REPO
  return [
    {
      key: 'windows', icon: 'win',
      builds: [
        { key: 'installer', ext: '.exe', href: dl?.winInstaller || fallback },
        { key: 'portable',  ext: '.msi', href: dl?.winMsi       || fallback }
      ]
    },
    {
      key: 'macos', icon: 'apple',
      builds: [
        { key: 'arm',   ext: 'ARM .dmg', href: dl?.macArm   || fallback },
        { key: 'intel', ext: 'x64 .dmg', href: dl?.macIntel || fallback }
      ]
    },
    {
      key: 'linux', icon: 'linux',
      builds: [
        { key: 'universal', ext: '.AppImage', href: dl?.linuxAppImage || fallback },
        { key: 'deb',       ext: '.deb',      href: dl?.linuxDeb      || fallback }
      ]
    }
  ]
})
</script>


<template>
  <section
    id="download"
    class="relative z-[2] border-t border-white/5"
    style="padding:clamp(44px,6vw,84px) clamp(18px,4vw,48px)"
  >
    <div data-reveal class="mx-auto mb-[42px] max-w-[760px] text-center">
      <SectionEyebrow>{{ t('download.eyebrow') }}</SectionEyebrow>
      <h2
        class="font-display"
        style="font-weight:700;font-size:clamp(26px,3.6vw,42px);letter-spacing:-.02em;margin:0 0 14px"
      >{{ t('download.heading') }}</h2>
      <p style="font-size:16px;color:#9fb0c8;margin:0">
        {{ t('download.version', { version: release?.version ? `v${release.version}` : '' }) }}
      </p>
    </div>

    <div
      class="mx-auto grid max-w-[1120px] gap-[18px]"
      style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"
    >
      <div
        v-for="p in platforms"
        :key="p.key"
        data-reveal
        class="flex flex-col rounded-[18px] border border-white/[0.08] p-7 transition-all duration-300 hover:-translate-y-[3px] hover:border-[rgba(125,211,252,.35)]"
        style="background:linear-gradient(180deg,rgba(18,27,46,.7),rgba(10,15,26,.7))"
      >
        <div class="mb-1.5 flex items-center gap-[13px]">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-[13px] border"
            style="background:rgba(56,189,248,.12);border-color:rgba(125,211,252,.25);color:#cfe9ff"
            v-html="icons[p.icon]"
          />
          <div>
            <div class="font-display" style="font-weight:600;font-size:20px">{{ t(`download.platforms.${p.key}.name`) }}</div>
            <div class="font-mono" style="font-size:11.5px;color:#6f819b">{{ t(`download.platforms.${p.key}.sub`) }}</div>
          </div>
        </div>
        <div style="height:1px;background:rgba(255,255,255,.06);margin:18px 0" />
        <div class="mt-auto flex flex-col gap-2.5">
          <a
            v-for="b in p.builds"
            :key="b.key"
            :href="b.href"
            target="_blank"
            rel="noreferrer"
            class="flex items-center justify-between gap-2.5 rounded-[11px] border border-white/[0.08] px-4 py-[13px] text-[14.5px] font-semibold no-underline transition-colors hover:border-[rgba(125,211,252,.45)]"
            style="background:rgba(255,255,255,.04);color:#eaf1fb"
          >
            <span>{{ t(`download.platforms.${p.key}.builds.${b.key}`) }}</span>
            <span class="font-mono" style="font-size:12px;color:#7dd3fc">{{ b.ext }}</span>
          </a>
        </div>
      </div>
    </div>

    <div data-reveal class="mx-auto mt-[22px] max-w-[1120px] text-center" style="font-size:13.5px;color:#6f819b">
      <i18n-t keypath="download.buildSource" tag="span" scope="global">
        <template #github>
          <a :href="GITHUB_REPO" target="_blank" rel="noreferrer" style="color:#7dd3fc;text-decoration:none">GitHub</a>
        </template>
      </i18n-t>
    </div>
  </section>
</template>
