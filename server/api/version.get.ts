// Pulls the current launcher version from the same `latest.json` the
// Spectra Launcher auto-updater checks (Tauri updater manifest on GitHub).
// Cached for an hour so we don't hammer GitHub on every page view.

const LATEST_JSON
  = 'https://github.com/MakotoPD/Spectra-Launcher/releases/latest/download/latest.json'
const RELEASES_PAGE
  = 'https://github.com/MakotoPD/Spectra-Launcher/releases/latest'

interface TauriUpdaterManifest {
  version?: string
  notes?: string
  pub_date?: string
  platforms?: Record<string, { url?: string; signature?: string }>
}

function pick(platforms: Record<string, { url?: string }>, key: string): string {
  return platforms[key]?.url || RELEASES_PAGE
}

export default defineCachedEventHandler(
  async () => {
    try {
      const manifest = await $fetch<TauriUpdaterManifest>(LATEST_JSON, {
        responseType: 'json',
        headers: { Accept: 'application/json' }
      })

      const version = (manifest.version || '').replace(/^v/, '')
      const platforms = manifest.platforms || {}

      const downloads = {
        winInstaller: pick(platforms, 'windows-x86_64-nsis'),
        winMsi:       pick(platforms, 'windows-x86_64-msi'),
        macArm:       pick(platforms, 'darwin-aarch64-app'),
        macIntel:     pick(platforms, 'darwin-x86_64-app'),
        linuxAppImage: pick(platforms, 'linux-x86_64-appimage'),
        linuxDeb:     pick(platforms, 'linux-x86_64-deb'),
      }

      // Primary CTA still points to the Windows installer
      const downloadUrl = downloads.winInstaller

      return {
        version: version || null,
        downloadUrl,
        releasesUrl: RELEASES_PAGE,
        downloads,
      }
    } catch {
      const fallbackDownloads = {
        winInstaller:  RELEASES_PAGE,
        winMsi:        RELEASES_PAGE,
        macArm:        RELEASES_PAGE,
        macIntel:      RELEASES_PAGE,
        linuxAppImage: RELEASES_PAGE,
        linuxDeb:      RELEASES_PAGE,
      }
      return {
        version: null,
        downloadUrl: RELEASES_PAGE,
        releasesUrl: RELEASES_PAGE,
        downloads: fallbackDownloads,
      }
    }
  },
  { maxAge: 60 * 60, name: 'launcher-version', getKey: () => 'latest' }
)
