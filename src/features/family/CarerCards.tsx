import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { dayOf, isLive, matchDoses, reviewAgeDays, slotsFor } from '../health/meds'
import { clock12 } from '../health/medActions'
import { shortMedName } from '../health/medName'
import { useMedications } from '../health/useMedications'
import { useTakenToday } from '../health/useActivity'
import { useWritableIds } from '../health/useCanMark'
import { doseRef } from '../inbox/MissedDoseActions'
import { shortName } from '../inbox/build'
import { ldb, logDose, type Medication } from '../log/store'
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

/** Rows of one kind grouped by person, in first-seen order: one card per person, one line per row (S8; ML-34: the count is the lines, the cards are the people). */
export function byPerson<T>(items: T[], personOf: (x: T) => string | null | undefined): { personId: string; items: T[] }[] {
  const out: { personId: string; items: T[] }[] = []
  for (const x of items) {
    const id = personOf(x)
    if (!id) continue
    const g = out.find((o) => o.personId === id)
    if (g) g.items.push(x); else out.push({ personId: id, items: [x] })
  }
  return out
}

/** Every dose nobody marked, today, for ONE person: a line per missed slot, one set of actions. Lines close by themselves when the dose is marked on this phone (and the row is marked seen so the count stays true). */
function MissedDosesCard({ rows, person }: { rows: AlertRow[]; person: FamilyPerson | undefined }) {
  const pid = rows[0]?.personId ?? ''
  const meds = useMedications(pid)
  const takes = useTakenToday(pid, { includeSkipped: true }) as MyTake[]
  const [ask, setAsk] = useState<string | null>(null) // row id being confirmed: one tap marks ONE slot only (ML-13)
  const [doneIds, setDoneIds] = useState<string[]>([])
  const now = new Date()
  const today = dayOf(now)
  const lines = rows.map((row) => {
    const { day, slot } = doseRef(row.ref)
    const open = slot && (day == null || day === today) ? matchDoses(slotsFor(meds, pid, today), takes, today).filter((d) => d.slot === slot && d.state === 'pending') : null
    return { row, day, slot, open, resolved: open != null && meds.length > 0 && open.length === 0 }
  })
  const resolvedKey = lines.filter((l) => l.resolved).map((l) => l.row.id).join(',')
  useEffect(() => { for (const id of resolvedKey ? resolvedKey.split(',') : []) void markSeen(id).catch(() => undefined) }, [resolvedKey])
  const shown = lines.filter((l) => !l.resolved)
  if (shown.length === 0) return null
  const name = shortName(person?.name) ?? 'Someone'
  const mark = async (l: (typeof shown)[number]) => {
    for (const d of l.open ?? []) { const med = meds.find((m) => m.serverId === d.medicationId && m.name === d.name) ?? meds.find((m) => m.name === d.name); if (med) await logDose(med, d.slot) }
    setAsk(null); setDoneIds((x) => [...x, l.row.id])
  }
  const what = (l: (typeof shown)[number]) => {
    const names = [...new Set((l.open ?? []).map((d) => shortMedName(d.name)))]
    const ago = slotAgo(l.day ?? today, l.slot, now)
    return l.slot ? `${names.length ? names.join(', ') : 'A dose'} was due ${clock12(l.slot)}${ago ? `, ${ago}` : ''}` : 'A dose was not marked'
  }
  const first = shown[0]!
  const confirm = (l: (typeof shown)[number]) => (
    <div className="in-confirm" role="alertdialog" aria-label="Confirm">
      <b>Did you see {name} take {(l.open?.length ?? 0) === 1 ? 'it' : 'them'}?</b>
      <div className="in-actions">
        <button type="button" className="btn in-act" onClick={() => void mark(l)}>Yes, I saw</button>
        <button type="button" className="btn in-act" onClick={() => setAsk(null)}>Not sure</button>
      </div>
    </div>
  )
  const call = person?.phone ? <a className="btn in-act" href={`tel:${person.phone}`}>Call {name}</a> : <a className="btn in-act" href={`#family/people/${pid}`}>Open {name}</a>
  return (
    <div className="card fm-need" data-kind="dose_missed">
      <Head person={person} title={shown.length === 1 ? `${name} missed a medicine` : `${name} missed ${shown.length} doses`} sub={shown.length === 1 ? what(shown[0]!) : 'Mark each one when you see it taken.'} />
      {shown.length > 1 && (
        <ul className="fm-need-lines">
          {shown.map((l) => (
            <li key={l.row.id}>
              {what(l)}
              {doneIds.includes(l.row.id) ? <span className="sh-sub" role="status"> Marked as taken</span> : (l.open?.length ?? 0) > 0 && ask !== l.row.id && <button type="button" className="btn in-act" aria-label={`Mark taken: ${what(l)}`} onClick={() => setAsk(l.row.id)}>Mark taken</button>}
              {ask === l.row.id && confirm(l)}
            </li>
          ))}
        </ul>
      )}
      <div className="in-actions" role="group" aria-label="What you can do">
        {call}
        {shown.length === 1 && (doneIds.includes(first.row.id) ? <span className="sh-sub" role="status">Marked as taken</span> : (first.open?.length ?? 0) > 0 && ask !== first.row.id && <button type="button" className="btn in-act" onClick={() => setAsk(first.row.id)}>Mark taken for {name}</button>)}
        <a className="btn in-act" href="#family">Message the family</a>
        {shown.length === 1 && ask === first.row.id && confirm(first)}
      </div>
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
  const askGroups = byPerson(asks, (a) => a.person.id)
  const phones = newestPerPerson(rows.filter((r) => r.kind === 'phone_health'))
  const moods = newestPerPerson(rows.filter((r) => r.kind === 'mood_unwell'))
  const count = doses.length + asks.length + phones.length + moods.length
  if (!count) return null
  return (
    <>
      <div className="fm-sech"><b>Needs you now</b><span className="sub">{count === 1 ? '1 thing' : `${count} things`}</span></div>
      {byPerson(doses, (r) => r.personId).map((g) => <MissedDosesCard key={g.personId} rows={g.items} person={who(g.personId)} />)}
      {askGroups.map((g) => {
        const person = g.items[0]!.person
        const name = shortName(person.name) ?? 'them'
        const when = (a: ReviewAsk) => `"Still taking ${shortMedName(a.med.name)}?" asked ${a.days === 1 ? 'yesterday' : `${a.days} days ago`}.`
        const keep = 'The reminders keep running until someone answers.'
        return (
          <div className="card fm-need" key={g.personId} data-kind="review_open">
            {g.items.length === 1 ? (
              <>
                <Head person={person} title={`${name} has not answered`} sub={`${when(g.items[0]!)} ${keep}`} />
                <div><button type="button" className="pill ghost fm-need-act" onClick={() => setAnswering(g.items[0]!)}>Answer for {name}</button></div>
              </>
            ) : (
              <>
                <Head person={person} title={`${name} has ${g.items.length} questions waiting`} sub={keep} />
                <ul className="fm-need-lines">
                  {g.items.map((a) => (
                    <li key={a.med.clientId ?? a.med.serverId ?? a.med.id}>
                      <span>{when(a)}</span>
                      <button type="button" className="pill ghost fm-need-act" aria-label={`Answer for ${name}: ${shortMedName(a.med.name)}`} onClick={() => setAnswering(a)}>Answer</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
      {answering && <FamilyAnswer name={shortName(answering.person.name) ?? 'them'} med={answering.med} by={self?.name ? (shortName(self.name) ?? self.name) : ''} onClose={() => setAnswering(null)} onDone={onNote} />}
    </>
  )
}
