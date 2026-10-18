import { Capacitor } from '@capacitor/core'
import type { HealthBridge, Platform, SensorType } from './health'

export const platform = (): Platform => {
  const p = Capacitor.getPlatform()
  return p === 'android' || p === 'ios' ? p : 'web'
}
export const isNative = () => Capacitor.isNativePlatform()

/** The real bridge, over @capgo/capacitor-health. The plugin loads only when a method is called on a phone. */
export function capgoBridge(): HealthBridge {
  const plugin = () => import('@capgo/capacitor-health').then((m) => m.Health)
  let why = ''
  const market = () => void window.open('market://details?id=com.google.android.apps.healthdata', '_system')
  return {
    platform: platform(),
    isAvailable: async () => {
      const r = await (await plugin()).isAvailable()
      why = r.available ? '' : (r.reason ?? '')
      return r.available
    },
    reason: () => why,
    requestAll: async (types: SensorType[]) => (await (await plugin()).requestAuthorization({ read: types })).readAuthorized.filter((t): t is SensorType => types.includes(t as SensorType)),
    openSettings: async (kind: 'settings' | 'install') => {
      if (kind === 'install') return market()
      try { await (await plugin()).openHealthConnectSettings() } catch { market() } // not installed or too old: its Play Store page
    },
    request: async (type: SensorType) => (await (await plugin()).requestAuthorization({ read: [type] })).readAuthorized.includes(type),
    granted: async (type: SensorType) => (await (await plugin()).checkAuthorization({ read: [type] })).readAuthorized.includes(type),
    read: async (type: SensorType, sinceIso: string) =>
      (await (await plugin()).readSamples({ dataType: type, startDate: sinceIso, endDate: new Date().toISOString(), limit: 1000, ascending: true })).samples
  }
}
