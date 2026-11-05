import { db } from '../../db'
import type { Reading } from '../health/ranges'
import { PLAUSIBLE as P } from '../health/plausible'
import { type Activity, type ActivitySource, ldb, isOldSensorSteps, logActivity, logReading, updateActivityTotals } from '../log/store'
import { getMember } from '../auth/session'
import { hdb } from '../records/store'
import { capgoBridge, isNative } from './bridge'

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
  /** Which app wrote the sample. Used only to pick one origin per hour when aggregation is unavailable; never stored or logged. */
  sourceId?: string
}
/** `more`: the read stopped at the page limit; the next sync continues from this start. */
export type ReadResult = RawSample[] & { more?: string }
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
  read(type: SensorType, sinceIso: string): Promise<ReadResult>
  /** Steps per hour as Health Connect itself sums them (apps that overlap count once). null = the method does not exist on this phone (sync falls back to read()); any other failure throws and sync retries. */
  readSteps?(sinceIso: string): Promise<RawSample[] | null>
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
    } else if (s.systolic && s.diastolic && s.systolic >= P.bp.min && s.systolic <= P.bp.max && s.diastolic >= 20 && s.diastolic <= 200 && s.diastolic < s.systolic) {
      // a cuff glitch (0, 999, bottom above top) is dropped here: a device row can raise the family alert (migration 0035), so an impossible number must never be saved
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
  /** Where a read cut off by the page limit carries on, instead of re-reading the same pages from the cursor window. */
  resume?: Partial<Record<SensorType, string>>
  /** Whose phone this is: a person signed in here who is not the owner reads nothing, so one person's Health Connect never lands on another's rows. */
  owner?: string
}
export const STATE_KEY = 'sensors.state'
const BACKFILL_MS = 7 * 86_400_000
const REBUILD_MS = 30 * 86_400_000 // about what Health Connect holds
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
  const me = await currentPersonId() // turning a sensor on is what says this phone is mine
  const st = await getState()
  // A takeover starts clean: the old owner's read points are not this person's, and their other types wait for this person's own tap.
  const base = me && st.owner && st.owner !== me ? { ...st, enabled: [], cursor: {}, resume: {}, off: SENSORS.map((s) => s.type) } : st
  await putState({ ...base, owner: me ?? st.owner, enabled: [...new Set([...base.enabled, ...granted])], off: (base.off ?? []).filter((t) => !granted.includes(t)) })
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
  const resume = { ...st.resume }
  delete cursor[type]
  delete resume[type]
  await putState({ ...st, enabled: st.enabled.filter((t) => t !== type), cursor, resume, off: byMember ? [...new Set([...(st.off ?? []), type])] : st.off })
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

// by instant: the server writes '+00:00' and the phone 'Z', so a pulled row never equals the phone's string
const activityKey = (a: Activity) => `${a.kind}|${Date.parse(a.startedAt)}`
const hasReading = async (r: Reading) =>
  (await hdb.readings.where('takenAt').equals(r.takenAt).filter((x) => x.test === r.test && x.personId === r.personId).count()) > 0

const HOUR = 3_600_000
const floorHour = (ms: number) => Math.floor(ms / HOUR) * HOUR
/** A stored cursor as a time, never past now: a sample or a phone clock can run ahead. 0 = none. */
const cursorMs = (iso: string | undefined, now: number) => Math.min(Date.parse(iso ?? '') || 0, now)
/** Kept outside the sensor state, so dropping a sensor cannot lose it. */
const rebuiltKey = (personId: string) => `sensors.stepsRebuilt.${personId}`
/** The start of this person's oldest hidden old steps row, while their one rebuild on this phone is still to do. null = nothing to rebuild (yet: a first pull can still bring old rows, so no marker is set for it). */
async function oldestHidden(personId: string): Promise<number | null> {
  if (await db.kv.get(rebuiltKey(personId))) return null
  const hidden = await ldb.activity.where('personId').equals(personId).filter(isOldSensorSteps).toArray()
  return hidden.length ? hidden.reduce((n, a) => Math.min(n, Date.parse(a.startedAt) || Infinity), Infinity) : null
}

/** Steps as completed whole hours, the one row shape (startedAt = hour start, 60 minutes). An aggregate bucket already counts overlapping apps once.
 *  Raw fallback: per hour and per origin, sum the samples that start in that hour and keep the largest origin; never a sum across origins. */
function hourlySteps(samples: RawSample[], aggregated: boolean): RawSample[] {
  const now = Date.now()
  const by = new Map<number, Map<string, number>>()
  for (const s of samples) {
    const t = Date.parse(s.startDate)
    const h = floorHour(t)
    if (!Number.isFinite(t) || !(s.value > 0) || h + HOUR > now) continue // the running hour is not stored
    const origins = by.get(h) ?? new Map<string, number>()
    const o = aggregated ? '' : (s.sourceId ?? '')
    by.set(h, origins.set(o, (origins.get(o) ?? 0) + s.value))
  }
  return [...by].map(([h, o]) => ({ startDate: new Date(h).toISOString(), endDate: new Date(h + HOUR).toISOString(), value: Math.max(...o.values()) }))
}

let running: Promise<SyncResult> | null = null
/** Reads everything new for every enabled type. Safe to call often: duplicates are skipped by
 *  (person, source, kind, startedAt) for activity and (person, test, takenAt) for readings.
 *  Concurrent calls share one run.
 *  ponytail: Reading has no source field, so a hand-typed reading at the exact same instant is also skipped. */
export function syncAll(bridge: HealthBridge): Promise<SyncResult> {
  running ??= run(bridge).finally(() => {
    running = null
  })
  return running
}

async function run(bridge: HealthBridge): Promise<SyncResult> {
  const result: SyncResult = { added: 0, byType: {} }
  const source = sourceFor(bridge.platform)
  const st = await getState()
  if (!source || !st.enabled.length) return result
  const personId = await currentPersonId()
  if (!personId) return result // signed out: log nothing
  if (st.owner && st.owner !== personId) return result // someone else's phone: no read, no rows, no rebuild
  if (!st.owner) await putState({ ...(await getState()), owner: personId }) // saved before owners existed: the first signed-in person
  for (const type of st.enabled) {
    try {
      if (!(await bridge.granted(type))) {
        await dropType(type, false) // user turned it off in the OS: follow them, never nag
        result.byType[type] = 'revoked'
        continue
      }
      // Re-read 48 h before the cursor; dedupe makes that safe. A read cut off by the page limit carries on where it stopped.
      // ponytail: upgrade to Health Connect changes tokens (getChanges) if the overlap read gets heavy; the plugin does not expose them yet.
      const stored = cursorMs(st.cursor[type], Date.now())
      const from = Date.parse(st.resume?.[type] ?? '') || (stored ? stored - OVERLAP_MS : Date.now() - BACKFILL_MS)
      // Steps: Health Connect's hourly sum first. Only null ("no such method") falls back to raw samples; a timeout or any other error throws to the catch below: no rows, cursor untouched, retried next sync.
      let samples: RawSample[]
      let covered: RawSample[] // what the cursor may move over: the finished hours, or the raw rows actually read
      let more: string | undefined
      let hidden: number | null = null
      if (type === 'steps') {
        // From the hour, for the raw read too: a part of the oldest hour would sum low.
        const readHours = async (ms: number) => {
          const since = new Date(floorHour(ms)).toISOString()
          const agg = (await bridge.readSteps?.(since)) ?? null
          const raw: ReadResult = agg ?? (await bridge.read(type, since))
          return { agg, raw }
        }
        hidden = await oldestHidden(personId)
        // Old rows read as nothing from the moment this version runs, so rebuild the days they covered that Health Connect still holds.
        const wide = hidden == null ? from : Math.min(from, Math.max(hidden, Date.now() - REBUILD_MS))
        const { agg, raw } = await readHours(wide).catch((e) => {
          if (floorHour(wide) === floorHour(from)) throw e
          hidden = null // a window too long for this phone must not stop today's steps: normal read now, rebuild again next sync
          return readHours(from)
        })
        samples = hourlySteps(raw, !!agg)
        covered = agg ? samples : raw
        more = raw.more
      } else {
        const raw = await bridge.read(type, new Date(from).toISOString())
        samples = covered = raw
        more = raw.more
      }
      const lastHr = type === 'heartRate' ? (await hdb.readings.where('test').equals('heart_rate').filter((x) => x.personId === personId).toArray()).map((x) => Date.parse(x.takenAt)).sort((a, b) => b - a)[0] : undefined
      const { activities, readings } = normalise(type, samples, personId, source, lastHr)
      const mine = activities.length ? await ldb.activity.where('personId').equals(personId).filter((x) => x.source === source && !isOldSensorSteps(x)).toArray() : []
      const byKey = new Map(mine.map((x) => [activityKey(x), x]))
      for (const a of activities) {
        const had = byKey.get(activityKey(a))
        if (!had) { byKey.set(activityKey(a), { ...a, id: await logActivity(a) }); result.added++ }
        // Only ever up: an hour can be read partly, or be lower on this phone than on the person's other phone. So an hour deleted in Health Connect keeps its old total.
        else if (a.kind === 'steps' && (a.steps ?? 0) > (had.steps ?? 0)) await updateActivityTotals(had.id!, a) // a watch can deliver an hour late
      }
      for (const r of readings) if (!(await hasReading(r))) { await logReading(r, { track: false }); result.added++ }
      if (hidden != null) await db.kv.put({ key: rebuiltKey(personId), value: new Date().toISOString() })
      const end = covered.map((s) => Date.parse(s.endDate)).filter(Number.isFinite)
      if (end.length) {
        const cur = await getState()
        if (!cur.enabled.includes(type)) { result.byType[type] = 'ok'; continue } // switched off mid-sync: do not resurrect its cursor
        // never earlier than before (a capped read of the overlap window ends before the old cursor), never past now
        const now = Date.now()
        const resume = { ...cur.resume, [type]: more }
        if (!more) delete resume[type]
        await putState({ ...cur, resume, cursor: { ...cur.cursor, [type]: new Date(Math.min(now, Math.max(...end, cursorMs(cur.cursor[type], now)))).toISOString() } })
      }
      result.byType[type] = 'ok'
    } catch {
      result.byType[type] = 'error' // one type failing must not stop the others; the cursor stays so the next sync retries
    }
  }
  return result
}

/** Sync now and each time the app comes back to the foreground. Returns the cleanup. */
export function syncOnResume(bridge: HealthBridge) {
  const go = () => {
    if (document.visibilityState === 'visible') void syncAll(bridge).catch(() => {})
  }
  document.addEventListener('visibilitychange', go)
  go()
  return () => document.removeEventListener('visibilitychange', go)
}

/** The app shell's one call. Web: nothing. No sensor on: run() stops before it touches the plugin. It only checks permission quietly, never asks. */
export const startSensorSync = (): (() => void) => (isNative() ? syncOnResume(capgoBridge()) : () => {})
