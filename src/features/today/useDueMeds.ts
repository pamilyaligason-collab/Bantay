import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { getMember } from '../auth/session'
import { useFamilyPeople } from '../family/roster'
import { canMarkFor, useWritableIds } from '../health/useCanMark'
import { isLive, parseSchedule } from '../health/meds'
import { ldb, logDose, type MedTaken, type Medication } from '../log/store'
import { nextDoses, type DuePerson } from './nextPick'

const NO_MEDS: Medication[] = []
const NO_TAKES: MedTaken[] = []
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** Medicines for Next up: the dose due soon (or just missed) for me and the people I can mark for, from the medications table (no profile text).
 *  `review` counts those people's medicines still waiting for "Still taking it?". */
export function useDueMeds(): { due: DuePerson[]; review: number; tick: Date } {
  const { people, selfId } = useFamilyPeople()
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const writable = useWritableIds(userId)
  const [meds, setMeds] = useState(NO_MEDS)
  const [takes, setTakes] = useState(NO_TAKES)
  const [tick, setTick] = useState(() => new Date())

  useEffect(() => {
    let live = true
    getMember().then((m) => { if (live) setUserId(m?.userId) }, () => undefined)
    const a = liveQuery(() => ldb.medications.toArray()).subscribe({ next: setMeds, error: () => undefined })
    const b = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(startOfDay().toISOString()).toArray()).subscribe({ next: setTakes, error: () => undefined })
    const t = setInterval(() => setTick(new Date()), 60_000)
    return () => { live = false; a.unsubscribe(); b.unsubscribe(); clearInterval(t) }
  }, [])

  const targets = useMemo(() => people.filter((p) => canMarkFor(p.id, selfId ?? '', writable)).map((p) => ({ personId: p.id, name: p.name, isMe: p.isMe })), [people, selfId, writable])
  const due = useMemo(() => nextDoses(targets, meds, takes, tick), [targets, meds, takes, tick])
  const review = useMemo(() => {
    const ids = new Set(targets.map((t) => t.personId))
    return meds.filter((m) => ids.has(m.personId) && isLive(m) && parseSchedule(m.schedule).review).length
  }, [targets, meds])
  return { due, review, tick }
}

/** Marks every dose of this group taken (or skipped) for the person, each with its medication id and slot. Resolves to false if storage failed. */
export async function markDue(d: DuePerson, skipped = false): Promise<boolean> {
  try {
    for (const s of d.slots) await logDose({ personId: d.personId, name: s.name, serverId: s.medicationId ?? undefined }, s.slot, { skipped })
    return true
  } catch {
    return false
  }
}
