import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import FmAvatar from './FmAvatar'
import { dayOf, matchDoses, slotsFor } from '../health/meds'
import { ON_TIME_MIN } from '../health/doseCount'
import { BP_WORDS, bpDoctorOf, bpPairLevel } from '../health/verdict'
import { ldb, type MedTaken, type Medication } from '../log/store'
import { shortMed } from '../today/nextPick'
import { hdb } from '../records/store'
import type { Reading } from '../health/ranges'
import { ageOf, checkInLabel, dial, lastCheckIn, useCheckIns, useFamilyPeople } from './roster'
import './family.css'
import { Icon } from '../shell/Icon'

const back = () => { location.hash = 'family' }

// ---- Today for one person (S12 K): doses, last mood, last BP. Read from this phone's copy, which holds only what the database policies let this user see.
export interface DoseLine { key: string; name: string; time: string; word: 'Taken' | 'Skipped' | 'Missed' | 'Due now' | 'Later'; state: 'taken' | 'missed' | 'open' }
export interface TodayView { doses: DoseLine[]; mood: { word: string; when: string } | null; bp: { value: string; word: string; when: string } | null }
type ActRow = { personId: string; kind: string; startedAt: string }
const MOOD_WORD: Record<string, string> = { 'mood-good': 'Good', 'mood-ok': 'OK', 'mood-low': 'Not good' }
const hm = (d: Date) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
const clockOf = (min: number) => hm(new Date(2000, 0, 1, Math.floor(min / 60), min % 60))
/** "8:05 AM", or "Yesterday 8:05 AM" / "Mon 19 Oct, 8:05 AM" when it was not today. */
export function whenAgo(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = dayOf(d)
  if (day === dayOf(now)) return hm(d)
  if (day === dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12))) return `Yesterday ${hm(d)}`
  return `${d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}, ${hm(d)}`
}
export function todayView(i: { meds: Medication[]; takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>[]; activity: ActRow[]; readings: Reading[]; thresholds: ({ key: string; high?: number | null })[]; personId: string; now: Date }): TodayView {
  const { now, personId } = i
  const day = dayOf(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const doses = matchDoses(slotsFor(i.meds, personId, day), i.takes, day).map((d): DoseLine => {
    const past = nowMin - d.at > ON_TIME_MIN // same 2 hours the adherence counter uses
    const word = d.state === 'taken' ? 'Taken' : d.state === 'skipped' ? 'Skipped' : past ? 'Missed' : d.at <= nowMin ? 'Due now' : 'Later'
    return { key: `${d.key}|${d.slot}`, name: shortMed(d.name), time: clockOf(d.at), word, state: word === 'Taken' ? 'taken' : word === 'Missed' || word === 'Skipped' ? 'missed' : 'open' }
  })
  const m = i.activity.filter((a) => a.personId === personId && a.kind in MOOD_WORD).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]
  const mine = i.readings.filter((r) => r.personId === personId && typeof r.value === 'number' && Number.isFinite(r.value))
  const newest = (t: string) => mine.filter((r) => r.test === t).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  const sys = newest('bp_systolic')
  const dia = newest('bp_diastolic')
  const lv = sys && dia ? bpPairLevel(sys.value, dia.value, bpDoctorOf(i.thresholds, personId)) : null
  return {
    doses,
    mood: m ? { word: MOOD_WORD[m.kind]!, when: whenAgo(m.startedAt, now) } : null,
    bp: sys && dia && lv ? { value: `${sys.value}/${dia.value}`, word: BP_WORDS[lv].word, when: whenAgo(sys.takenAt, now) } : null
  }
}
const EMPTY = { meds: [] as Medication[], takes: [] as MedTaken[], activity: [] as ActRow[], readings: [] as Reading[], thresholds: [] as { key: string; high?: number | null }[] }
function useToday(personId: string): TodayView {
  const [d, setD] = useState(EMPTY)
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const sub = liveQuery(async () => ({
      meds: await ldb.medications.where('personId').equals(personId).toArray(),
      takes: await ldb.meds.where('personId').equals(personId).toArray(),
      activity: await ldb.activity.where('personId').equals(personId).toArray(),
      readings: await hdb.readings.where('personId').equals(personId).toArray(),
      thresholds: await hdb.thresholds.toArray()
    })).subscribe({ next: setD, error: () => setD(EMPTY) })
    const t = setInterval(() => setTick(new Date()), 60_000)
    return () => { sub.unsubscribe(); clearInterval(t) }
  }, [personId])
  return useMemo(() => todayView({ ...d, personId, now: tick }), [d, personId, tick])
}

/** The "Today" card of the member page and the report: today's doses (taken or missed), the last mood and the last blood pressure with its word. */
export function MemberToday({ personId, first }: { personId: string; first: string }) {
  const v = useToday(personId)
  return (
    <section aria-labelledby="mt-h" data-testid="member-today">
      <h2 className="hd" id="mt-h">Today</h2>
      <div className="card list">
        {v.doses.length === 0 && <div><div className="grow"><b>Medicines</b><span className="sub">No doses due today on this phone</span></div></div>}
        {v.doses.map((d) => <div key={d.key} data-state={d.state}><div className="grow"><b>{d.name}</b><span className="sub">{d.time}</span></div><span className="sub">{d.word}</span></div>)}
        <div><div className="grow"><b>Mood</b><span className="sub">{v.mood ? `${v.mood.word}, ${v.mood.when}` : `${first} has not said how they feel yet`}</span></div></div>
        <div><div className="grow"><b>Blood pressure</b><span className="sub">{v.bp ? `${v.bp.value}, ${v.bp.word}, ${v.bp.when}` : 'No blood pressure saved yet'}</span></div></div>
      </div>
    </section>
  )
}

/** A family member's page (mockup v6 "member"): photo, who and how old, call and text, last check-in, their Medical ID. */
export default function MemberPage({ id }: { id: string }) {
  const { people } = useFamilyPeople()
  const last = useCheckIns()
  const p = people.find((x) => x.id === id)
  if (!p) {
    return (
      <>
        <button type="button" className="fm-back" onClick={back}><Icon name="back" size={20} />Back to People</button>
        <div className="card"><p className="sub fm-empty">We could not find this person on this phone yet.</p></div>
      </>
    )
  }
  const c = checkInLabel(last[p.id])
  const age = ageOf(p.birthdate)
  const num = dial(p.phone)
  const when = lastCheckIn(last[p.id])
  const first = p.name.trim().split(/\s+/)[0] ?? p.name

  return (
    <>
      <button type="button" className="fm-back" onClick={back}><Icon name="back" size={20} />Back to People</button>
      <div className="hdr"><h1>{p.name}</h1></div>
      <div className="card fm-who">
        <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={64} status={c.ok ? 'ok' : 'none'} />
        <div className="grow">
          <b>{c.text}</b>
          <span className="sub">{[age != null ? `${age} years old` : null, p.phone].filter(Boolean).join(' · ') || 'No age or phone saved yet'}</span>
        </div>
      </div>
      {num ? (
        <div className="fm-actions">
          <a className="pill ghost" href={`tel:${num}`}>Call {first}</a>
          <a className="pill ghost" href={`sms:${num}`}>Text {first}</a>
        </div>
      ) : (
        <p className="sub fm-empty">No phone number saved for {first}. They can add it in Me.</p>
      )}
      <MemberToday personId={p.id} first={first} />
      <div className="card list">
        <div><div className="grow"><b>Last check-in</b><span className="sub">{when ?? 'Never checked in on this phone'}</span></div></div>
        <a className="fm-link" href={`#medid/${p.id}`}><span className="grow"><b>{first}'s Medical ID</b><span className="sub">Allergies, conditions, who to call</span></span><span className="fm-chev"><Icon name="chev" size={20} /></span></a>
      </div>
      <a className="btn fm-report" href={`#family/people/${p.id}/report`}><Icon name="file" size={22} />Full report</a>
      <div className="card fm-share">
        <b>What stays private</b>
        <p className="sub">Health readings and records are private. Only {first}, the family admins, and the people {first} shares with can see them.</p>
      </div>
    </>
  )
}
