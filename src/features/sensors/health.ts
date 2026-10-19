import { db } from '../../db'
import type { Reading } from '../health/ranges'
import { type Activity, type ActivitySource, ldb, logActivity, logReading } from '../log/store'
import { getMember } from '../auth/session'
import { hdb } from '../records/store'

/** Health Connect (Android) and HealthKit (iOS) behind one small interface, so Vitest can swap in a fake.
 *  Everything read is stored locally first and synced through the outbox by logActivity / logReading.
 *  Nothing here sends a notification (B-7: no health values in any notification). */
export type SensorType = 'steps' | 'sleep' | 'heartRate' | 'bloodPressure'
export type Platform = 'android' | 'ios' | 'web'

/** Plain-English reason shown next to each switch, and before the OS asks. */
export const SENSORS: { type: SensorType; label: string; why: string }[] = [
  { type: 'steps', label: 'Steps', why: 'Shows how much you walked today without you typing it in.' },
  { type: 'sleep', label: 'Sleep', why: 'Shows how long you slept last night.' },
  { type: 'heartRate', label: 'Heart rate', why: 'Adds the readings from your watch or band to your Health charts.' },
  { type: 'bloodPressure', label: 'Blood pressure', why: 'Adds readings from your cuff so you do not have to type them.' }
]

export interface RawSample {
  startDate: string
  endDate: string
  value: number
  sleepState?: string
  stages?: { stage: string; durationMinutes: number }[]
  systolic?: number
  diastolic?: number
}
export interface HealthDiag {
  available: boolean | null
  platform: string
  reason: string
  /** Raw text of the last requestAuthorization / checkAuthorization call: the returned list, or the error message and code. */
  lastRequest: string
  lastCheck: string
  granted: SensorType[]
}
export interface HealthBridge {
  platform: Platform
  isAvailable(): Promise<boolean>
  /** Asks the OS for read access to this one type. Resolves true only if it was granted. */
  request(type: SensorType): Promise<boolean>
  /** All of these in ONE permission sheet. Resolves with the types that were granted. */
  requestAll?(types: SensorType[]): Promise<SensorType[]>
  /** Opens Health Connect (kind 'settings') or its Play Store page (kind 'install'). */
  openSettings?(kind: 'settings' | 'install'): Promise<void>
  /** Why the phone said Health Connect is not usable, when it said. */
  reason?(): string
  /** For the 'Health Connect check' row: raw values from the plugin, and the last request/check outcome incl. error text. */
  diagnose?(): Promise<HealthDiag>
  /** Quiet check, no prompt. False if the user has since turned it off in the OS. */
  granted(type: SensorType): Promise<boolean>
  read(type: SensorType, sinceIso: string): Promise<RawSample[]>
}

export const sourceFor = (p: Platform): ActivitySource | null => (p === 'android' ? 'health-connect' : p === 'ios' ? 'healthkit' : null)

// ---- normalisation ----------------------------------------------------------------------------
const iso = (s: string) => new Date(s).toISOString()
const mins = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000))
const ASLEEP = new Set(['asleep', 'light', 'deep', 'rem'])
const THIN_MS = 15 * 60_000 // heart rate: keep the first reading in each 15 minutes

export interface Normalised {
  activities: Activity[]
  readings: Reading[]
}

/** `lastHrMs`: time of the newest stored heart_rate, so thinning holds across syncs. */
export function normalise(type: SensorType, samples: RawSample[], personId: string, source: ActivitySource, lastHrMs?: number): Normalised {
  const out: Normalised = { activities: [], readings: [] }
  const seenBucket = new Set<number>()
  for (const s of samples) {
    if (![Date.parse(s.startDate), Date.parse(s.endDate), s.value].every(Number.isFinite)) continue
    const startedAt = iso(s.startDate)
    if (type === 'steps') {
      if (s.value > 0) out.activities.push({ personId, kind: 'steps', minutes: mins(s.startDate, s.endDate) || null, steps: Math.round(s.value), startedAt, source })
    } else if (type === 'sleep') {
      const asleep = s.stages?.length
        ? s.stages.filter((g) => ASLEEP.has(g.stage)).reduce((n, g) => n + g.durationMinutes, 0)
        : s.sleepState && !ASLEEP.has(s.sleepState)
          ? 0
          : s.value
      if (asleep > 0) out.activities.push({ personId, kind: 'sleep', minutes: Math.round(asleep), steps: null, startedAt, source })
    } else if (type === 'heartRate') {
      const bucket = Math.floor(Date.parse(s.startDate) / THIN_MS)
      const t = Date.parse(s.startDate)
      const nearStored = lastHrMs != null && t !== lastHrMs && Math.abs(t - lastHrMs) < THIN_MS
      if (s.value > 0 && !nearStored && !seenBucket.has(bucket)) {
        seenBucket.add(bucket)
        out.readings.push({ personId, takenAt: startedAt, test: 'heart_rate', value: Math.round(s.value), unit: 'bpm' })
      }
    } else if (s.systolic && s.diastolic) {
      out.readings.push({ personId, takenAt: startedAt, test: 'bp_systolic', value: Math.round(s.systolic), unit: 'mmHg' })
      out.readings.push({ personId, takenAt: startedAt, test: 'bp_diastolic', value: Math.round(s.diastolic), unit: 'mmHg' })
    }
  }
  return out
}

// ---- state ------------------------------------------------------------------------------------
interface State {
  enabled: SensorType[]
  cursor: Partial<Record<SensorType, string>>
  /** Types the member switched off in the app; reconcile does not turn these back on just because the OS still allows them. */
  off?: SensorType[]
}
export const STATE_KEY = 'sensors.state'
const BACKFILL_MS = 7 * 86_400_000
const OVERLAP_MS = 48 * 3_600_000 // Health Connect data can arrive late from a watch
export const getState = async (): Promise<State> => {
  const raw = (await db.kv.get(STATE_KEY))?.value as Partial<State> | undefined
  const st: State = { enabled: [], cursor: {}, ...raw }
  // Upgrade: state saved before the `off` list existed. Whatever was not on was off, so reconcile never switches it on behind the member's back.
  if (raw && !raw.off) st.off = SENSORS.map((s) => s.type).filter((t) => !st.enabled.includes(t))
  return st
}
const putState = (s: State) => db.kv.put({ key: STATE_KEY, value: s })

/** Whose data this phone logs: the signed-in member's own person (D-21). null = signed out, so nothing is logged. */
export async function currentPersonId(): Promise<string | null> {
  return (await getMember())?.personId ?? null
}

export type EnableResult = 'on' | 'denied' | 'unavailable'
export interface EnableOutcome {
  result: EnableResult
  granted: SensorType[]
  /** The phone's own error text, when there was one. Shown small and logged; never a health value. */
  error?: string
}
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : '').slice(0, 160)
/** Turn types on. The OS permission prompt appears only here. More than one type goes in ONE sheet when the bridge can. */
export async function enableTypes(types: SensorType[], bridge: HealthBridge): Promise<EnableOutcome> {
  if (!sourceFor(bridge.platform)) return { result: 'unavailable', granted: [] }
  let error: string | undefined
  const avail = await bridge.isAvailable().catch((e) => { error = errText(e); return false })
  if (!avail) {
    error ||= bridge.reason?.()
    if (error) console.warn('health unavailable', error)
    return { result: 'unavailable', granted: [], error }
  }
  const granted: SensorType[] = []
  try {
    if (types.length > 1 && bridge.requestAll) granted.push(...(await bridge.requestAll(types)))
    else for (const t of types) if (await bridge.request(t)) granted.push(t)
  } catch (e) {
    error = errText(e)
    console.warn('health permission failed', error)
  }
  if (!granted.length) { // some phones answer the prompt with an empty list: ask quietly what the OS really allows
    for (const t of types) if (await bridge.granted(t).catch(() => false)) granted.push(t)
  }
  if (!granted.length) return { result: 'denied', granted, error }
  const st = await getState()
  await putState({ ...st, enabled: [...new Set([...st.enabled, ...granted])], off: (st.off ?? []).filter((t) => !granted.includes(t)) })
  return { result: 'on', granted }
}
export async function enableType(type: SensorType, bridge: HealthBridge): Promise<EnableResult> {
  return (await enableTypes([type], bridge)).result
}
/** Stops reading. Access itself is revoked in Health Connect or Settings; the screen says so. */
export async function disableType(type: SensorType) {
  await dropType(type, true)
}
/** Stops reading a type. `byMember` = the switch in the app: only that remembers "off" so reconcile leaves it alone.
 *  An OS revoke drops it from enabled only, so allowing it again in Health Connect brings it back. */
async function dropType(type: SensorType, byMember: boolean) {
  const st = await getState()
  const cursor = { ...st.cursor }
  delete cursor[type]
  await putState({ enabled: st.enabled.filter((t) => t !== type), cursor, off: byMember ? [...new Set([...(st.off ?? []), type])] : st.off })
}

/** On open: types the OS already allows (granted earlier, or in Health Connect) but the app does not list get switched on.
 *  Quiet check, no prompt. Types the member turned off here stay off. Returns the types it added. */
export async function reconcileGranted(bridge: HealthBridge): Promise<SensorType[]> {
  if (!sourceFor(bridge.platform) || !(await bridge.isAvailable().catch(() => false))) return []
  const st = await getState()
  const add: SensorType[] = []
  for (const { type } of SENSORS) if (!st.enabled.includes(type) && !(st.off ?? []).includes(type) && (await bridge.granted(type).catch(() => false))) add.push(type)
  if (!add.length) return []
  const now = await getState() // re-read: a switch may have been flipped while we asked the OS
  const fresh = add.filter((t) => !now.enabled.includes(t) && !(now.off ?? []).includes(t))
  if (fresh.length) await putState({ ...now, enabled: [...now.enabled, ...fresh] })
  return fresh
}

// ---- sync -------------------------------------------------------------------------------------
export type SyncStatus = 'ok' | 'revoked' | 'error'
export interface SyncResult {
  added: number
  byType: Partial<Record<SensorType, SyncStatus>>
}

const hasActivity = async (a: Activity) =>
  (await ldb.activity.where('startedAt').equals(a.startedAt).filter((x) => x.source === a.source && x.kind === a.kind && x.personId === a.personId).count()) > 0
const hasReading = async (r: Reading) =>
  (await hdb.readings.where('takenAt').equals(r.takenAt).filter((x) => x.test === r.test && x.personId === r.personId).count()) > 0

let running: Promise<SyncResult> | null = null
/** Reads everything new for every enabled type. Safe to call often: duplicates are skipped by
 *  (person, source, kind, startedAt) for activity and (person, test, takenAt) for readings.
 *  Concurrent calls share one run.
 *  ponytail: Reading has no source field, so a hand-typed reading at the exact same instant is also skipped. */
export function syncAll(bridge: HealthBridge, personId?: string): Promise<SyncResult> {
  running ??= run(bridge, personId).finally(() => {
    running = null
  })
  return running
}

async function run(bridge: HealthBridge, personIdArg?: string): Promise<SyncResult> {
  const result: SyncResult = { added: 0, byType: {} }
  const source = sourceFor(bridge.platform)
  const st = await getState()
  if (!source || !st.enabled.length) return result
  const personId = personIdArg ?? (await currentPersonId())
  if (!personId) return result // signed out: log nothing
  for (const type of st.enabled) {
    try {
      if (!(await bridge.granted(type))) {
        await dropType(type, false) // user turned it off in the OS: follow them, never nag
        result.byType[type] = 'revoked'
        continue
      }
      // Re-read 48 h before the cursor; dedupe makes that safe.
      // ponytail: upgrade to Health Connect changes tokens (getChanges) if the overlap read gets heavy; the plugin does not expose them yet.
      const since = st.cursor[type] ? new Date(Date.parse(st.cursor[type]!) - OVERLAP_MS).toISOString() : new Date(Date.now() - BACKFILL_MS).toISOString()
      const samples = await bridge.read(type, since)
      const lastHr = type === 'heartRate' ? (await hdb.readings.where('test').equals('heart_rate').filter((x) => x.personId === personId).toArray()).map((x) => Date.parse(x.takenAt)).sort((a, b) => b - a)[0] : undefined
      const { activities, readings } = normalise(type, samples, personId, source, lastHr)
      for (const a of activities) if (!(await hasActivity(a))) { await logActivity(a); result.added++ }
      for (const r of readings) if (!(await hasReading(r))) { await logReading(r); result.added++ }
      const end = samples.map((s) => Date.parse(s.endDate)).filter(Number.isFinite)
      if (end.length) {
        const cur = await getState()
        if (!cur.enabled.includes(type)) { result.byType[type] = 'ok'; continue } // switched off mid-sync: do not resurrect its cursor
        await putState({ ...cur, cursor: { ...cur.cursor, [type]: new Date(Math.max(...end)).toISOString() } })
      }
      result.byType[type] = 'ok'
    } catch {
      result.byType[type] = 'error' // one type failing must not stop the others; the cursor stays so the next sync retries
    }
  }
  return result
}

/** Sync when the app comes back to the foreground. Returns the cleanup. */
export function syncOnResume(bridge: HealthBridge, onDone?: (r: SyncResult) => void) {
  const go = () => {
    if (document.visibilityState === 'visible') void syncAll(bridge).then(onDone, () => {})
  }
  document.addEventListener('visibilitychange', go)
  go()
  return () => document.removeEventListener('visibilitychange', go)
}
