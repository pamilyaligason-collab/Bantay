import { Capacitor } from '@capacitor/core'
import type { HealthBridge, HealthDiag, Platform, RawSample, SensorType } from './health'

export const platform = (): Platform => {
  const p = Capacitor.getPlatform()
  return p === 'android' || p === 'ios' ? p : 'web'
}
export const isNative = () => Capacitor.isNativePlatform()

/** N-1: a Health Connect call that never answers (seen on a phone) must end in a visible error, not "Checking..." forever. */
export const HC_TIMEOUT_MS = 10_000
export const within = <T>(p: Promise<T>, ms = HC_TIMEOUT_MS): Promise<T> =>
  new Promise<T>((ok, no) => {
    const t = setTimeout(() => no(new Error(`Health Connect did not answer in ${Math.round(ms / 1000)} s`)), ms)
    p.then((v) => { clearTimeout(t); ok(v) }, (e) => { clearTimeout(t); no(e) })
  })

const PAGE = 1000
const MAX_PAGES = 20 // a window with more rows than this continues on the next sync, from `more`

/** The real bridge, over @capgo/capacitor-health. The plugin loads only when a method is called on a phone. */
export function capgoBridge(): HealthBridge {
  let loading: ReturnType<typeof load> | undefined
  // N-1 root cause: a Capacitor plugin proxy answers `then`, so resolving a promise with it never settles. Keep it wrapped; never return it from async code.
  const load = () => import('@capgo/capacitor-health').then((m) => ({ h: m.Health }))
  const plugin = () => within(loading ??= load()) // one import shared by calls that overlap (mount check + a tap)
  let why = ''
  const trace = { request: '(not called yet)', check: '(not called yet)' }
  const fmt = (e: unknown) => { const o = e as { code?: unknown; message?: unknown } | null; return `ERROR code=${String(o?.code ?? '')} message=${String(o?.message ?? e)}` }
  /** Runs a plugin call, keeps its raw result or error in the trace, and rethrows: nothing is swallowed. */
  const traced = async <T>(slot: 'request' | 'check', f: () => Promise<T>): Promise<T> => {
    try { const r = await (slot === 'check' ? within(f()) : f()); trace[slot] = `OK ${JSON.stringify(r)}`; return r } catch (e) { trace[slot] = fmt(e); throw e }
  }
  const only = (l: string[] | undefined, types: SensorType[]) => (l ?? []).filter((t): t is SensorType => types.includes(t as SensorType))
  const market = () => void window.open('market://details?id=com.google.android.apps.healthdata', '_system')
  return {
    platform: platform(),
    isAvailable: async () => {
      const r = await within(((await plugin()).h).isAvailable())
      why = r.available ? '' : (r.reason ?? '')
      return r.available
    },
    reason: () => why,
    requestAll: async (types: SensorType[]) => {
      const p = (await plugin()).h
      const r = await traced('request', () => p.requestAuthorization({ read: types }))
      const got = only(r.readAuthorized, types)
      if (got.length) return got
      // some phones return an empty list even when the user allowed it: ask quietly what is really granted
      return only((await traced('check', () => p.checkAuthorization({ read: types }))).readAuthorized, types)
    },
    diagnose: async (): Promise<HealthDiag> => {
      const p = (await plugin()).h
      const all: SensorType[] = ['steps', 'sleep', 'heartRate', 'bloodPressure']
      let available: boolean | null = null
      let reason = ''
      try { const r = await within(p.isAvailable()); available = r.available; reason = `platform=${String((r as { platform?: unknown }).platform ?? '')} reason=${r.reason ?? ''}` } catch (e) { reason = fmt(e) }
      let granted: SensorType[] = []
      try { granted = only((await traced('check', () => p.checkAuthorization({ read: all }))).readAuthorized, all) } catch { /* recorded in trace.check */ }
      return { available, platform: Capacitor.getPlatform(), reason, lastRequest: trace.request, lastCheck: trace.check, granted }
    },
    openSettings: async (kind: 'settings' | 'install') => {
      if (kind === 'install') return market()
      try { await ((await plugin()).h).openHealthConnectSettings() } catch { market() } // not installed or too old: its Play Store page
    },
    request: async (type: SensorType) => {
      const p = (await plugin()).h
      if ((await traced('request', () => p.requestAuthorization({ read: [type] }))).readAuthorized.includes(type)) return true
      return (await traced('check', () => p.checkAuthorization({ read: [type] }))).readAuthorized.includes(type)
    },
    granted: async (type: SensorType) => (await within(((await plugin()).h).checkAuthorization({ read: [type] }))).readAuthorized.includes(type),
    // Health Connect's own sum: apps that overlap count once, and there is no row cap. Buckets are cut from startDate, so align it to the hour or an hour would change its start between syncs (Android; iOS bucket anchoring is unverified).
    // null = this phone's plugin or Health Connect has no such method (sync falls back to raw samples). Any other failure, a timeout included, is thrown so sync leaves the cursor alone and retries.
    readSteps: async (sinceIso: string) => {
      const h = (await plugin()).h
      const startDate = new Date(Math.floor(Date.parse(sinceIso) / 3_600_000) * 3_600_000).toISOString()
      try {
        return (await within(h.queryAggregated({ dataType: 'steps', startDate, endDate: new Date().toISOString(), bucket: 'hour', aggregation: 'sum' }))).samples
      } catch (e) {
        if (typeof h.queryAggregated !== 'function' || (e as { code?: unknown } | null)?.code === 'UNIMPLEMENTED') return null
        throw e
      }
    },
    // The plugin returns at most one page. Page on from the last start (rows repeat at the seam: dropped by value) until a short page, no new rows, or the page limit.
    read: async (type: SensorType, sinceIso: string) => {
      const h = (await plugin()).h
      const endDate = new Date().toISOString()
      const out: RawSample[] = []
      const seen = new Set<string>()
      let from = sinceIso
      for (let page = 0; page < MAX_PAGES; page++) {
        const { samples } = await within(h.readSamples({ dataType: type, startDate: from, endDate, limit: PAGE, ascending: true }))
        const before = out.length
        for (const s of samples) if (!seen.has(JSON.stringify(s))) { seen.add(JSON.stringify(s)); out.push(s) }
        if (samples.length < PAGE || out.length === before) return out
        from = samples[samples.length - 1].startDate
      }
      return Object.assign(out, { more: from })
    }
  }
}

