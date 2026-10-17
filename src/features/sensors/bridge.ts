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
  return {
    platform: platform(),
    isAvailable: async () => (await (await plugin()).isAvailable()).available,
    request: async (type: SensorType) => (await (await plugin()).requestAuthorization({ read: [type] })).readAuthorized.includes(type),
    granted: async (type: SensorType) => (await (await plugin()).checkAuthorization({ read: [type] })).readAuthorized.includes(type),
    read: async (type: SensorType, sinceIso: string) =>
      (await (await plugin()).readSamples({ dataType: type, startDate: sinceIso, endDate: new Date().toISOString(), limit: 1000, ascending: true })).samples
  }
}
