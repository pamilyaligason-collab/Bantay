import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { useActivity } from '../health/useActivity'
import { toCanonicalReading, type Reading } from '../health/ranges'
import { hdb } from '../records/store'
import type { Range } from '../health/ranges'
import { useKv } from '../safety/store'
import { useProfile, useSelfPersonId } from '../setup/useProfile'
import { DOCTOR_OK_KEY, GATE_KEY, type RecommendInput } from './recommend'

/** Whole years from a 'YYYY-MM-DD' birthdate; null when missing or not a date (unknown is null, never 0). */
export function ageFrom(birthdate: string | null | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate ?? '')
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (!(y > 1900) || mo < 1 || mo > 12) return null
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1
  return age >= 0 && age < 120 ? age : null
}

const DAY = 86_400_000
const latest = (rows: Reading[], tests: string[], since: string) =>
  rows.filter((r) => tests.includes(r.test) && r.takenAt >= since && Number.isFinite(r.value)).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]

/** Today's BP and sugar for the rest rule: the newest reading from the last 24 hours, else none. Sugar in other units is converted first. */
export function latestVitals(rows: Reading[], now = new Date()): Pick<RecommendInput, 'latestBp' | 'latestSugar'> {
  const since = new Date(now.getTime() - DAY).toISOString()
  const sys = latest(rows, ['bp_systolic'], since)
  const dia = latest(rows, ['bp_diastolic'], since)
  const g = latest(rows, ['fasting_glucose', 'glucose', 'random_glucose'], since)
  const gc = g ? toCanonicalReading(g) : null
  return { latestBp: sys && dia ? { sys: sys.value, dia: dia.value } : null, latestSugar: gc ? gc.value : null }
}

/** The person's own limits for BP and sugar, from Health thresholds (key `personId:test`). */
export function familyOf(ts: (Range & { key: string })[], personId: string): RecommendInput['family'] {
  const get = (...tests: string[]) => tests.map((t) => ts.find((x) => x.key === `${personId}:${t}`)).find(Boolean) ?? null
  return { sys: get('bp_systolic'), dia: get('bp_diastolic'), sugar: get('fasting_glucose', 'glucose') }
}

const NO_ROWS: Reading[] = []
/** Everything Move needs for the signed-in person: age and conditions from the profile, today's vitals, this week's rows, and the two saved acknowledgements. */
export function useMoveData() {
  const personId = useSelfPersonId()
  const profile = useProfile(personId)
  const acts = useActivity(personId ?? '', 14)
  const gateOk = useKv<boolean>(GATE_KEY, false)
  const doctorOk = useKv<boolean>(DOCTOR_OK_KEY, false)
  const [readings, setReadings] = useState<Reading[]>(NO_ROWS)
  useEffect(() => {
    if (!personId) return setReadings(NO_ROWS)
    const sub = liveQuery(() => hdb.readings.where('personId').equals(personId).toArray()).subscribe({ next: setReadings, error: () => setReadings(NO_ROWS) })
    return () => sub.unsubscribe()
  }, [personId])
  const [family, setFamily] = useState<RecommendInput['family']>(undefined)
  useEffect(() => {
    if (!personId) return setFamily(undefined)
    const sub = liveQuery(() => hdb.thresholds.toArray()).subscribe({ next: (ts) => setFamily(familyOf(ts, personId)), error: () => setFamily(undefined) })
    return () => sub.unsubscribe()
  }, [personId])
  return { personId, acts, gateOk, doctorOk, family, age: ageFrom(profile?.birthdate), conditions: profile?.conditions ?? [], ...latestVitals(readings) }
}
