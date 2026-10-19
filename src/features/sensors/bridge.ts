import { Capacitor } from '@capacitor/core'
import type { HealthBridge, HealthDiag, Platform, SensorType } from './health'

export const platform = (): Platform => {
  const p = Capacitor.getPlatform()
  return p === 'android' || p === 'ios' ? p : 'web'
}
export const isNative = () => Capacitor.isNativePlatform()

/** The real bridge, over @capgo/capacitor-health. The plugin loads only when a method is called on a phone. */
export function capgoBridge(): HealthBridge {
  let loading: ReturnType<typeof load> | undefined
  const load = () => import('@capgo/capacitor-health').then((m) => m.Health)
  const plugin = () => (loading ??= load()) // one import shared by calls that overlap (mount check + a tap)
  let why = ''
  const trace = { request: '(not called yet)', check: '(not called yet)' }
  const fmt = (e: unknown) => { const o = e as { code?: unknown; message?: unknown } | null; return `ERROR code=${String(o?.code ?? '')} message=${String(o?.message ?? e)}` }
  /** Runs a plugin call, keeps its raw result or error in the trace, and rethrows: nothing is swallowed. */
  const traced = async <T>(slot: 'request' | 'check', f: () => Promise<T>): Promise<T> => {
    try { const r = await f(); trace[slot] = `OK ${JSON.stringify(r)}`; return r } catch (e) { trace[slot] = fmt(e); throw e }
  }
  const only = (l: string[] | undefined, types: SensorType[]) => (l ?? []).filter((t): t is SensorType => types.includes(t as SensorType))
  const market = () => void window.open('market://details?id=com.google.android.apps.healthdata', '_system')
  return {
    platform: platform(),
    isAvailable: async () => {
      const r = await (await plugin()).isAvailable()
      why = r.available ? '' : (r.reason ?? '')
      return r.available
    },
    reason: () => why,
    requestAll: async (types: SensorType[]) => {
      const p = await plugin()
      const r = await traced('request', () => p.requestAuthorization({ read: types }))
      const got = only(r.readAuthorized, types)
      if (got.length) return got
      // some phones return an empty list even when the user allowed it: ask quietly what is really granted
      return only((await traced('check', () => p.checkAuthorization({ read: types }))).readAuthorized, types)
    },
    diagnose: async (): Promise<HealthDiag> => {
      const p = await plugin()
      const all: SensorType[] = ['steps', 'sleep', 'heartRate', 'bloodPressure']
      let available: boolean | null = null
      let reason = ''
      try { const r = await p.isAvailable(); available = r.available; reason = `platform=${String((r as { platform?: unknown }).platform ?? '')} reason=${r.reason ?? ''}` } catch (e) { reason = fmt(e) }
      let granted: SensorType[] = []
      try { granted = only((await traced('check', () => p.checkAuthorization({ read: all }))).readAuthorized, all) } catch { /* recorded in trace.check */ }
      return { available, platform: Capacitor.getPlatform(), reason, lastRequest: trace.request, lastCheck: trace.check, granted }
    },
    openSettings: async (kind: 'settings' | 'install') => {
      if (kind === 'install') return market()
      try { await (await plugin()).openHealthConnectSettings() } catch { market() } // not installed or too old: its Play Store page
    },
    request: async (type: SensorType) => {
      const p = await plugin()
      if ((await traced('request', () => p.requestAuthorization({ read: [type] }))).readAuthorized.includes(type)) return true
      return (await traced('check', () => p.checkAuthorization({ read: [type] }))).readAuthorized.includes(type)
    },
    granted: async (type: SensorType) => (await (await plugin()).checkAuthorization({ read: [type] })).readAuthorized.includes(type),
    read: async (type: SensorType, sinceIso: string) =>
      (await (await plugin()).readSamples({ dataType: type, startDate: sinceIso, endDate: new Date().toISOString(), limit: 1000, ascending: true })).samples
  }
}
