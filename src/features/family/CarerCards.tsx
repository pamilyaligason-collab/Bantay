import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { dayOf, isLive, matchDoses, reviewAgeDays, slotsFor } from '../health/meds'
import { clock12 } from '../health/medActions'
import { useMedications } from '../health/useMedications'
import { useTakenToday } from '../health/useActivity'
import { useWritableIds } from '../health/useCanMark'
import { doseRef, MissedDoseActions } from '../inbox/MissedDoseActions'
import { shortName } from '../inbox/build'
import { ldb, type Medication } from '../log/store'
import { markSeen, type AlertRow } from '../notify/store'
import { renderTemplate } from '../notify/templates'
import { useAlertRows } from '../notify/useAlerts'
import type { MyTake } from '../today/useMyTakes'
import FamilyAnswer from './FamilyAnswer'
import FmAvatar from './FmAvatar'
import { dial, useFamilyPeople, type FamilyPerson } from './roster'
import './family.css'

/** "Needs you now" at the top of Family (mockup family-home, the cards marked NEW): for a person who looks after someone. A missed dose (Call, Mark taken for her under the M4 rule),
 *  a "Still taking it?" nobody answered for a day, a phone that may miss alarms, and "not feeling well" (raised by Today's mood row). All of it is read from this phone:
 *  the carer_alerts rows the server wrote (they arrive while Bantay is open) and the medicines the carer's phone already holds. Nothing here is raised by this file. */
export interface ReviewAsk { person: FamilyPerson; med: Medication; days: number }

/** Live medicines whose "Still taking it?" has been open for a day or more, for the people given; the oldest question first. */
export function reviewAsks(meds: Medication[], people: FamilyPerson[], today: Date = new Date()): ReviewAsk[] {
  const out: ReviewAsk[] = []
  for (const med of meds) {
    const person = people.find((p) => p.id === med.personId)
    const days = isLive(med) ? reviewAgeDays(med, today) : null
    if (person && days != null && days >= 1) out.push({ person, med, days })
  }
  return out.sort((a, b) => b.days - a.days || a.med.name.localeCompare(b.med.name))
}

/** "1 h 10 min ago" for a Manila day + 'HH:MM' slot; '' when it is not in the past or the parts are missing. */
export function slotAgo(day: string | null, slot: string | null, now: Date = new Date()): string {
  const at = day && slot ? Date.parse(`${day}T${slot}:00+08:00`) : NaN
  const min = Math.floor((now.getTime() - at) / 60_000)
  if (Number.isNaN(min) || min < 0) return ''
  return min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''} ago`
}

const NONE: Medication[] = []
function useReviewMeds(ids: string[]): Medication[] {
  const [rows, setRows] = useState<Medication[]>(NONE)
  const key = ids.join(',')
  useEffect(() => {
    if (!key) return setRows(NONE)
    const want = key.split(',')
    const sub = liveQuery(() => ldb.medications.where('personId').anyOf(want).toArray()).subscribe({ next: setRows, error: () => setRows(NONE) })
    return () => sub.unsubscribe()
  }, [key])
  return rows
}

function useUserId(): string | undefined {
  const [id, setId] = useState<string>()
  useEffect(() => {
    let live = true
    void supabase?.auth.getSession().then(({ data }) => { if (live) setId(data.session?.user.id) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  return id
}

/** A dose row that MissedDoseCard can show: its slot is today (Manila) or has no day. Older ones stay in the alert list. A dose marked on this phone closes its card and marks the row seen, which drops it from the count. */
export const showsAsCard = (ref: string | null, now: Date = new Date()) => { const { day } = doseRef(ref); return day == null || day === dayOf(now) }

const newestPerPerson = (rows: AlertRow[]) => rows.filter((r, i) => !!r.personId && rows.findIndex((x) => x.personId === r.personId) === i)

function Head({ person, title, sub }: { person: FamilyPerson | undefined; title: string; sub: string }) {
  return (
    <div className="fm-need-top">
      <FmAvatar name={person?.name ?? '?'} photoPath={person?.photoPath} thumb={person?.thumb} size={44} />
      <div className="grow"><b>{title}</b><div className="sub">{sub}</div></div>
    </div>
  )
}

/** A dose nobody marked, today. It closes by itself when the dose is marked on this phone (and the row is marked seen so the count stays true). */
function MissedDoseCard({ row, person }: { row: AlertRow; person: FamilyPerson | undefined }) {
  const pid = row.personId ?? ''
  const meds = useMedications(pid)
  const takes = useTakenToday(pid, { includeSkipped: true }) as MyTake[]
  const now = new Date()
  const { day, slot } = doseRef(row.ref)
  const today = dayOf(now)
  const open = slot && (day == null || day === today) ? matchDoses(slotsFor(meds, pid, today), takes, today).filter((d) => d.slot === slot && d.state === 'pending') : null
  const resolved = open != null && meds.length > 0 && open.length === 0
  useEffect(() => { if (resolved) void markSeen(row.id).catch(() => undefined) }, [resolved, row.id])
  if (resolved || !showsAsCard(row.ref, now)) return null // an older one stays in the alert list, not here
  const names = [...new Set((open ?? []).map((d) => d.name))]
  const ago = slotAgo(day ?? today, slot, now)
  const what = slot ? `${names.length ? names.join(', ') : 'A dose'} was due ${clock12(slot)}${ago ? `, ${ago}` : ''}` : 'A dose was not marked'
  return (
    <div className="card fm-need" data-kind="dose_missed">
      <Head person={person} title={`${shortName(person?.name) ?? 'Someone'} missed a medicine`} sub={what} />
      <MissedDoseActions personId={row.personId} refText={row.ref} now={now} />
    </div>
  )
}

/** The people this user looks after as a writer carer (never themself); empty until the carers list is read, or when signed out. */
export function useCarerIds(): string[] {
  const { selfId } = useFamilyPeople()
  return useWritableIds(useUserId()).filter((id) => id !== selfId)
}

export function CarerCards({ onMessage, onPhones, onNote }: { onMessage: (personId: string) => void; onPhones: () => void; onNote: (text: string) => void }) {
  const { people, selfId } = useFamilyPeople()
  const writable = useCarerIds()
  const rows = useAlertRows().filter((r) => r.seenAt == null)
  const asks = reviewAsks(useReviewMeds(writable), people)
  const [answering, setAnswering] = useState<ReviewAsk | null>(null)
  const self = people.find((p) => p.id === selfId)
  const who = (id: string | null) => people.find((p) => p.id === id)
  const doses = rows.filter((r) => r.kind === 'dose_missed' && r.personId && showsAsCard(r.ref))
  const phones = newestPerPerson(rows.filter((r) => r.kind === 'phone_health'))
  const moods = newestPerPerson(rows.filter((r) => r.kind === 'mood_unwell'))
  const count = doses.length + asks.length + phones.length + moods.length
  if (!count) return null
  return (
    <>
      <div className="fm-sech"><b>Needs you now</b><span className="sub">{count === 1 ? '1 thing' : `${count} things`}</span></div>
      {doses.map((r) => <MissedDoseCard key={r.id} row={r} person={who(r.personId)} />)}
      {asks.map((a) => {
        const name = shortName(a.person.name) ?? 'them'
        return (
          <div className="card fm-need" key={a.med.clientId ?? a.med.serverId ?? a.med.id} data-kind="review_open">
            <Head person={a.person} title={`${name} has not answered`} sub={`"Still taking ${a.med.name}?" asked ${a.days === 1 ? 'yesterday' : `${a.days} days ago`}. The reminders keep running until someone answers.`} />
            <div><button type="button" className="pill ghost fm-need-act" onClick={() => setAnswering(a)}>Answer for {name}</button></div>
          </div>
        )
      })}
      {phones.map((r) => {
        const p = who(r.personId)
        const name = shortName(p?.name) ?? 'Someone'
        return (
          <div className="card fm-need" key={r.id} data-kind="phone_health">
            <Head person={p} title={`${name}'s phone may miss alarms`} sub="Open the phone list to see which setting to fix." />
            <div><button type="button" className="pill ghost fm-need-act" onClick={() => { void markSeen(r.id).catch(() => undefined); onPhones() }}>Fix {name}'s phone</button></div>
          </div>
        )
      })}
      {moods.map((r) => {
        const p = who(r.personId)
        const name = shortName(p?.name)
        const call = dial(p?.phone ?? null)
        const done = () => void markSeen(r.id).catch(() => undefined)
        return (
          <div className="card fm-need" key={r.id} data-kind="mood_unwell">
            <Head person={p} title={renderTemplate('mood_unwell', { name }).title} sub="They chose Not feeling well in How are you?" />
            <div className="fm-need-row">
              {call && <a className="pill primary fm-need-act" href={`tel:${call}`} onClick={done}>Call {name ?? 'them'}</a>}
              <button type="button" className="pill ghost fm-need-act" onClick={() => { done(); if (r.personId) onMessage(r.personId) }}>Message</button>
              <button type="button" className="pill ghost fm-need-act" onClick={done}>Got it</button>
            </div>
          </div>
        )
      })}
      <p className="sub fm-need-note">Family alerts show here when you open Bantay. The browser app also gets notifications.</p>
      {answering && <FamilyAnswer name={shortName(answering.person.name) ?? 'them'} med={answering.med} by={self?.name ? (shortName(self.name) ?? self.name) : ''} onClose={() => setAnswering(null)} onDone={onNote} />}
    </>
  )
}
