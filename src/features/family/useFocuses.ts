import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type MedTaken, type Medication } from '../log/store'
import { hdb } from '../records/store'
import { useAlertRows } from '../notify/useAlerts'
import { useActing, useViewedVisibleIds } from '../viewas/viewAs'
import { reviewAsks, showsAsCard, useCarerIds, type ReviewAsk } from './CarerCards'
import { todayView } from './MemberPage'
import { personFocus, sortByFocus, type Focus } from './personFocus'
import { checkInLabel, useCheckInsLoaded, useFamilyPeople, type FamilyPerson } from './roster'

export interface PersonFocus { person: FamilyPerson; focus: Focus; missedDoses: { med: Medication; slot: string; time: string }[]; asks: ReviewAsk[]; alertIds: string[] }
type D = { meds: Medication[]; takes: MedTaken[]; activity: { personId: string; kind: string; startedAt: string }[]; readings: never[]; thresholds: { key: string; high?: number | null }[] }
const EMPTY: D = { meds: [], takes: [], activity: [], readings: [], thresholds: [] }

/** One live read for every visible person, then personFocus per person, red first. `loaded` stays false until the first read so no card says "No check-in today" before we know. */
export function useFocuses(people: FamilyPerson[]): { loaded: boolean; items: PersonFocus[]; rollOk: number } {
  const last = useCheckInsLoaded()
  const alerts = useAlertRows()
  const writable = useCarerIds()
  const { acting } = useActing()
  const [d, setD] = useState<D | null>(null)
  const [now, setNow] = useState(() => new Date())
  const key = people.map((p) => p.id).join(',')
  useEffect(() => {
    const ids = key ? key.split(',') : []
    const sub = liveQuery(async () => ({
      meds: await ldb.medications.where('personId').anyOf(ids).toArray(),
      takes: await ldb.meds.where('personId').anyOf(ids).toArray(),
      activity: await ldb.activity.where('personId').anyOf(ids).toArray(),
      readings: [] as never[],
      thresholds: await hdb.thresholds.toArray()
    })).subscribe({ next: setD, error: () => setD(EMPTY) })
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => { sub.unsubscribe(); clearInterval(t) }
  }, [key])
  return useMemo(() => {
    if (!d || !last) return { loaded: false, items: [], rollOk: 0 }
    const unwell = new Set(alerts.filter((a) => a.kind === 'mood_unwell' && a.seenAt == null && a.personId).map((a) => a.personId))
    const items = people.map((person): PersonFocus => {
      const tv = todayView({ ...d, takes: d.takes.filter((t) => t.personId === person.id), personId: person.id, now }) // a name-only take of one person must not clear another person's dose
      const mine = d.takes.filter((t) => t.personId === person.id)
      // A server dose_missed alert for today is addressed to carers only (carer_alerts), so holding one proves the right to read this person's takes: never hide a missed dose behind "No data" then, even for a read-only carer with no take rows yet.
      const hasMissedAlert = alerts.some((a) => a.kind === 'dose_missed' && a.personId === person.id && showsAsCard(a.ref, now))
      const noTakes = !person.isMe && mine.length === 0 && !writable.includes(person.id) && !hasMissedAlert
      const missed = tv.doses.filter((x) => x.word === 'Missed')
      const asks = !acting && writable.includes(person.id) ? reviewAsks(d.meds, [person], now) : [] // answering needs write access, never for yourself
      const focus = personFocus(person, {
        unwell: unwell.has(person.id), missed, due: tv.doses.filter((x) => x.word === 'Due now'), later: tv.doses.filter((x) => x.word === 'Later').length,
        asks, checkIn: last[person.id], canMark: !acting && writable.includes(person.id), noTakes, now
      })
      const missedDoses = noTakes ? [] : missed.flatMap((m) => {
        const [k, slot] = m.key.split('|')
        const med = d.meds.find((x) => x.personId === person.id && (x.serverId ?? x.clientId ?? String(x.id ?? x.name)) === k)
        return med && slot ? [{ med, slot, time: m.time }] : []
      })
      const alertIds = alerts.filter((a) => a.kind === 'dose_missed' && a.seenAt == null && a.personId === person.id).map((a) => a.id)
      return { person, focus, missedDoses, asks, alertIds }
    })
    return { loaded: true, items: sortByFocus(items), rollOk: people.filter((p) => checkInLabel(last[p.id], now).ok).length }
  }, [d, last, alerts, writable, acting, people, now])
}

/** Everyone the screen may show: all of the family, or while acting only who the viewed person can see (fails closed). */
export function useVisiblePeople(): FamilyPerson[] {
  const { people } = useFamilyPeople()
  const visible = useViewedVisibleIds()
  return useMemo(() => (visible ? people.filter((p) => visible.has(p.id)) : people), [people, visible])
}
