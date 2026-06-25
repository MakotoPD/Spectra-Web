// Detects the visitor's OS for the "Download for {os}" label.
// Defaults to Windows for SSR, refined on the client after mount.
export function useOs() {
  const os = useState<'Windows' | 'macOS' | 'Linux'>('os', () => 'Windows')

  onMounted(() => {
    try {
      const ua = `${navigator.userAgent || ''} ${navigator.platform || ''}`
      if (/Mac/i.test(ua)) os.value = 'macOS'
      else if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) os.value = 'Linux'
      else os.value = 'Windows'
    } catch { /* keep default */ }
  })

  return os
}
