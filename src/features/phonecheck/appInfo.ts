import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/** Shells below this version cannot report alarm health: `alarms_ok` stays null ("old app"), never false (ML-05). */
export const ALARM_SHELL = '2.3.0'

/** True when `v` (x.y.z) is at least `min`. false for null or an unparseable value, so unknown never counts as new enough. */
export function versionAtLeast(v: string | null | undefined, min: string): boolean {
  const a = /^(\d+)\.(\d+)\.(\d+)/.exec(v ?? '')
  const b = /^(\d+)\.(\d+)\.(\d+)/.exec(min)
  if (!a || !b) return false
  for (let i = 1; i <= 3; i++) { const d = Number(a[i]) - Number(b[i]); if (d !== 0) return d > 0 }
  return true
}

let cached: Promise<string | null> | undefined
/** The Android shell's version name (App.getInfo), read once. null on the web or when it cannot be read. Lane S1 owns `src/native/shell.ts` (shellVersion); this reads the same value until that merges. */
export function shellVersionNow(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null)
  cached ??= Promise.resolve().then(() => App.getInfo()).then((i) => (typeof i?.version === 'string' ? i.version : null)).catch(() => null)
  return cached
}
/** Test helper: forget the cached version. */
export const resetShellVersionForTests = () => { cached = undefined }

/** Manila calendar day (UTC+8, no daylight saving) as YYYY-MM-DD: the day the family's alerts use. */
export const manilaDay = (now: Date): string => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
