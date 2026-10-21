import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'
import { getMember, type Member } from '../auth/session'
import type { Range, Reading } from '../health/ranges'
import { useMedications } from '../health/useMedications'
import { ldb, type Medication, type MedTaken } from '../log/store'
import { hdb } from '../records/store'
import { canViewReport, flagLine, type Report, buildReport } from './reportLogic'
import type { FamilyPerson } from './roster'

type Client = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const KEY = 'carers.all'

/** Person ids the user is a carer of (read-only or writer): the same set the readings read policy lets through. Cached in kv; offline or on error the cache is used. */
export async function loadCarerOf(client: Client | null, userId: string): Promise<string[]> {
  const cached = async () => { try { const v = (await db.kv.get(KEY))?.value as { userId?: string; ids?: string[] } | undefined; return v?.userId === userId ? (v.ids ?? []) : [] } catch { return [] } }
  if (!client) return cached()
  try {
    const r = await client.from('carers').select('person_id').eq('carer_id', userId)
    if (r.error) return cached()
    const ids = ((r.data ?? []) as { person_id: string }[]).map((x) => x.person_id)
    await db.kv.put({ key: KEY, value: { userId, ids } }).catch(() => {})
    return ids
  } catch { return cached() }
}

/** null while loading; then whether this user may see this person's health report. */
export function useReportAccess(personId: string): boolean | null {
  const [state, setState] = useState<{ member: Member | null; carers: string[] } | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const member = await getMember().catch(() => null)
      const carers = member ? await loadCarerOf(supabase as Client | null, member.userId) : []
      if (live) setState({ member, carers })
    })()
    return () => { live = false }
  }, [])
  if (!state) return null
  const { member, carers } = state
  return canViewReport({ signedIn: !!member, personId, ownId: member?.personId ?? '', carerIds: carers, isAdmin: member?.role === 'admin' })
}

const NO_READINGS: Reading[] = []
const NO_TAKES: MedTaken[] = []
const NO_MEDS: Medication[] = []
type Threshold = Range & { key: string }

function useLive<T>(query: () => Promise<T>, init: T, deps: unknown[]): T {
  const [v, setV] = useState<T>(init)
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setV, error: () => setV(init) })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

/** The report for one person from what is on this phone (readings, medicines, doses, saved questions), live. */
export function useMemberReport(personId: string): Report {
  const readings = useLive(() => hdb.readings.where('personId').equals(personId).toArray(), NO_READINGS, [personId])
  const thresholds = useLive<Threshold[]>(() => hdb.thresholds.toArray(), [], [])
  const takes = useLive(() => ldb.meds.where('personId').equals(personId).toArray(), NO_TAKES, [personId])
  const meds = useMedications(personId)
  const [questions, setQuestions] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void db.kv.get(`visits.questions.${personId}`).then((r) => { if (live) setQuestions(Array.isArray(r?.value) ? (r!.value as unknown[]).filter((x): x is string => typeof x === 'string') : []) }).catch(() => {})
    return () => { live = false }
  }, [personId])
  return useMemo(
    () => buildReport({ readings, meds: meds ?? NO_MEDS, takes, questions, personId, now: new Date(), familyOf: (r) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`) }),
    [readings, meds, takes, questions, personId, thresholds]
  )
}

/** One neutral line per person for the People list ("2 to check"), no numbers. Missing entry means this phone has nothing for them. */
export function useFlagLines(people: FamilyPerson[]): Record<string, string> {
  const readings = useLive(() => hdb.readings.toArray(), NO_READINGS, [])
  const thresholds = useLive<Threshold[]>(() => hdb.thresholds.toArray(), [], [])
  const takes = useLive(() => ldb.meds.toArray(), NO_TAKES, [])
  const meds = useLive(() => ldb.medications.toArray(), NO_MEDS, [])
  return useMemo(() => {
    const now = new Date()
    const out: Record<string, string> = {}
    for (const p of people) {
      const l = flagLine({ readings: readings.filter((r) => r.personId === p.id), meds, takes: takes.filter((t) => t.personId === p.id), personId: p.id, now, familyOf: (r) => thresholds.find((t) => t.key === `${r.personId}:${r.test}`) })
      if (l) out[p.id] = l
    }
    return out
  }, [people, readings, meds, takes, thresholds])
}
