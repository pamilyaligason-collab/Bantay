import { Capacitor } from '@capacitor/core'

// Feature detection for the Android shell (C2). An old shell on the new web degrades to the PWA behaviour, never a crash.
// The shell's version comes from App.getInfo() once, at start; until it is known (and on the web) every check says "no".
let version: string | null = null
let started: Promise<void> | null = null

/** Read the shell version once. Safe to call again; resolves quietly when there is no app plugin (web, tests). */
export function initShell(): Promise<void> {
  started ??= (async () => {
    if (!Capacitor.isNativePlatform()) return
    try {
      const { App } = await import('@capacitor/app')
      const v = (await App.getInfo()).version
      version = typeof v === 'string' && /^\d+(\.\d+){0,2}/.test(v) ? v : null
    } catch { version = null }
  })()
  return started
}
void initShell()

/** App.getInfo().version, read once at start; null on the web or before it is known. */
export const shellVersion = (): string | null => version

const parts = (v: string) => (/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v) ?? []).slice(1, 4).map((n) => Number(n ?? 0))

/** Semver compare (major.minor.patch; a suffix such as -rc is ignored). False on the web and when the version is unknown or `v` is not a version. */
export function shellAtLeast(v: string): boolean {
  if (version == null || !/^\d+/.test(v)) return false
  const a = parts(version)
  const b = parts(v)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return true
}

/** Is this native plugin present in the running shell? 'Call' | 'SettingsOpener' | 'TextToSpeech' | any name. False on the web. */
export function hasPlugin(name: 'Call' | 'SettingsOpener' | 'TextToSpeech' | (string & {})): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name) } catch { return false }
}
