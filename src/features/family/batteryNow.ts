export interface BatteryNow { pct: number; charging: boolean }
type BatteryManagerLike = { level: number; charging: boolean }

/** The phone's battery right now (Web Battery API: Android WebView yes, iOS no). null when unsupported or it throws: unknown is never 0 (ML-05). */
export async function batteryNow(): Promise<BatteryNow | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }
    const b = await nav.getBattery?.()
    if (!b || typeof b.level !== 'number' || !Number.isFinite(b.level) || b.level < 0 || b.level > 1) return null
    return { pct: Math.round(b.level * 100), charging: b.charging === true }
  } catch { return null }
}
