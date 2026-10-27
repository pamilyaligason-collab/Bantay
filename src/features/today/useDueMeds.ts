import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { getMember, onAuthChange } from '../auth/session'
import { useFamilyPeople } from '../family/roster'
import { canMarkFor, useWritableIds } from '../health/useCanMark'
import { isLive, parseSchedule } from '../health/meds'
import { hdb } from '../records/store'
import { ldb, logDose, type MedTaken, type Medication } from '../log/store'
import { nextDoses, type DuePerson } from './nextPick'

const NO_MEDS: Medication[] = []
const NO_IDS: string[] = []
const NO_TAKES: MedTaken[] = []
const startOfYesterday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1); return d } // yesterday's late doses count at the midnight edge

/** Medicines for Next up: the dose due soon (or just missed) for me and the people I can mark for, from the medications table (no profile text).
 *  `review` counts those people's medicines still waiting for "Still taking it?". */
export function useDueMeds(): { due: DuePerson[]; review: number; tick: Date } {
  const { people, selfId } = useFamilyPeople()
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const writable = useWritableIds(userId)
  const [allMeds, setMeds] = useState(NO_MEDS)
  const [known, setKnown] = useState(NO_IDS) // people this phone still knows; an archived person's medicines may linger in the local table
  const [takes, setTakes] = useState(NO_TAKES)
  const [tick, setTick] = useState(() => new Date())

  useEffect(() => {
    let live = true
    const who = () => { void getMember().then((m) => { if (live) setUserId(m?.userId) }, () => undefined) }
    who()
    const off = onAuthChange(who) // signing in or out re-reads who I can mark for
    const a = liveQuery(() => ldb.medications.toArray()).subscribe({ next: setMeds, error: () => undefined })
    const k = liveQuery(() => hdb.people.toCollection().primaryKeys()).subscribe({ next: (ids) => setKnown(ids as string[]), error: () => undefined })
    const b = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(startOfYesterday().toISOString()).toArray()).subscribe({ next: setTakes, error: () => undefined })
    const t = setInterval(() => setTick(new Date()), 60_000)
    return () => { live = false; off(); a.unsubscribe(); k.unsubscribe(); b.unsubscribe(); clearInterval(t) }
  }, [])

  const meds = useMemo(() => { const ok = new Set(known); return allMeds.filter((m) => m.personId === selfId || ok.has(m.personId)) }, [allMeds, known, selfId])
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

/** Marks only the chosen medicines taken (their `key`, or server id) among the doses due now for this person. Resolves to the rows logged (0 when none matched or storage failed).
 *  Reads the same local tables the Next up card is drawn from, so the ticks and the rows agree. */
export async function markTaken(personId: string, medIds: string[]): Promise<number> {
  if (!medIds.length) return 0
  try {
    const [meds, takes] = await Promise.all([ldb.medications.toArray(), ldb.meds.where('takenAt').aboveOrEqual(startOfYesterday().toISOString()).toArray()])
    const d = nextDoses([{ personId, name: '', isMe: false }], meds, takes, new Date())[0]
    const pick = (d?.slots ?? []).filter((s) => medIds.includes(s.key) || (s.medicationId != null && medIds.includes(s.medicationId)))
    for (const s of pick) await logDose({ personId, name: s.name, serverId: s.medicationId ?? undefined }, s.slot)
    return pick.length
  } catch {
    return 0
  }
}
