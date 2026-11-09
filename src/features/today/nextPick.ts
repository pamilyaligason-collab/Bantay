import { clock } from '../health/model'
import { shortMedName } from '../health/medName'
import { manilaDay, manilaMinutes, matchDoses, slotsFor, type MedSlot } from '../health/meds'
import type { MedTaken, Medication } from '../log/store'
import { ON_TIME_MIN } from '../health/doseCount'
import type { HeroCard } from './heroCards'

/** Next up: ONE item. Medicine due soon or just missed (mine or someone I care for) > plan item due today > storm within 500 km > all clear.
 *  Weather is never picked here: it has its own card on Today. */

export const UPCOMING_MIN = 180 // a dose is "next" from 3 hours before its time ...
export const MISSED_MIN = 120 // ... and stays on the card for 2 hours after it

export interface DoseTarget { personId: string; name: string; isMe: boolean }
export interface DuePerson extends DoseTarget {
  at: number // minutes after Manila midnight (of its own day) of the earliest open dose
  rel: number // minutes from today's midnight: negative for yesterday's slot, 1440+ for tomorrow's
  status: 'upcoming' | 'missed'
  /** The open doses at that time (one per medicine). */
  slots: MedSlot[]
}
export type NextKind = 'dose' | 'plan' | 'storm' | 'calm'
export interface NextItem { key: string; kind: NextKind; kicker: string; title: string; body: string; note?: string; who?: DuePerson; href?: string; linkLabel?: string; late?: boolean }

type Take = Pick<MedTaken, 'personId' | 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>

const DAY_MIN = 1440
/** A Manila calendar day (YYYY-MM-DD) moved by n days: plain date arithmetic, so this phone's time zone never shifts it (D-148, ML-38). */
export const addManilaDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
/** The n Manila days ending today, oldest first. */
export const manilaDaysEnding = (now: Date, n: number) => Array.from({ length: n }, (_, i) => addManilaDays(manilaDay(now), i - (n - 1)))

/** Per person, the earliest open dose that is due within 3 hours or was missed within the last 2, looking at yesterday's, today's and tomorrow's slots
 *  so the window holds across midnight (a 22:00 dose stays until 00:00 + 2 h; a 00:30 dose shows from 21:30). Earliest first, me first on a tie. */
export function nextDoses(people: DoseTarget[], meds: Medication[], takes: Take[], now: Date): DuePerson[] {
  const nowMin = manilaMinutes(now) // slots are Manila clock times
  return people.flatMap((p): DuePerson[] => {
    const mine = takes.filter((t) => t.personId === p.personId)
    const open = [-1, 0, 1].flatMap((k) => {
      const day = addManilaDays(manilaDay(now), k)
      return matchDoses(slotsFor(meds, p.personId, day), mine, day, manilaDay).filter((d) => d.state === 'pending').map((d) => ({ d, rel: d.at + k * DAY_MIN }))
    }).filter(({ rel }) => rel - nowMin <= UPCOMING_MIN && nowMin - rel <= MISSED_MIN).sort((a, b) => a.rel - b.rel)
    if (!open.length) return []
    const first = open[0]!
    return [{ ...p, at: first.d.at, rel: first.rel, status: first.rel < nowMin ? 'missed' : 'upcoming', slots: open.filter((x) => x.rel === first.rel).map((x) => x.d) }]
  }).sort((a, b) => a.rel - b.rel || Number(b.isMe) - Number(a.isMe))
}

/** The snooze key of a dose card (also its NextItem key). */
export const doseKey = (d: DuePerson) => `dose:${d.personId}:${d.at}`

/** The Manila day (YYYY-MM-DD) the dose belongs to: `rel` is minutes from today's midnight, so a 23:30 dose seen at 00:10 is yesterday's. The native snooze keys its alarm on this day. */
export const doseDay = (d: DuePerson, now: Date) => addManilaDays(manilaDay(now), Math.floor(d.rel / DAY_MIN))

export const joinNames = (n: string[]) => (n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

/** "40 minutes" / "1 hour 5 minutes" from a minute count (S28: whole words, no '9m'). */
const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const span = (n: number) => (n < 60 ? unit(n, 'minute') : `${unit(Math.floor(n / 60), 'hour')}${n % 60 ? ` ${unit(n % 60, 'minute')}` : ''}`)

/** "8:00 PM · in 40 min · 1 tablet": only the parts we know (the dose text is the medicine's own dose field; nothing is made up). */
export function whenLine(d: DuePerson, now: Date): string {
  const diff = d.rel - manilaMinutes(now) // Manila clock like the slots (D-148), never this phone's
  const dose = d.slots.length === 1 ? d.slots[0]!.dose?.trim() : ''
  return [clock(d.at), diff > 0 ? `in ${span(diff)}` : diff < 0 ? `${span(-diff)} ago` : 'now', dose].filter(Boolean).join(' · ')
}

/** A dose past its slot: it still counts as on time until ON_TIME_MIN after the slot (the same 2 hours the adherence counter uses). */
export const lateNote = (d: DuePerson) => `On time until ${clock((d.at + ON_TIME_MIN) % DAY_MIN)}.`

export function pickNext(i: { due: DuePerson[]; plan: HeroCard | null; storm: { title: string; body: string } | null }, now: Date = new Date()): NextItem {
  const d = i.due[0]
  if (d) {
    const names = [...new Set(d.slots.map((s) => shortMedName(s.name)))]
    const others = [...new Set(i.due.slice(1).map((o) => o.name))]
    const title = d.isMe ? joinNames(names) : `${d.name}: ${joinNames(names)}`
    const late = d.status === 'missed'
    const note = [late ? lateNote(d) : '', others.length ? `Also waiting: ${joinNames(others)}.` : ''].filter(Boolean).join(' ')
    return { key: doseKey(d), kind: 'dose', kicker: late ? 'Late · not taken yet' : 'Next up · medicine', title, body: whenLine(d, now), note: note || undefined, who: d, late }
  }
  const p = i.plan
  if (p) return { key: p.key, kind: 'plan', kicker: p.kicker, title: p.title, body: p.body, href: '#family/plan', linkLabel: 'Open plan' }
  if (i.storm) return { key: 'storm', kind: 'storm', kicker: 'Storm nearby', title: i.storm.title, body: i.storm.body, href: '#safety/storms', linkLabel: 'Storm tracker' }
  return { key: 'calm', kind: 'calm', kicker: 'Next up', title: 'All clear', body: 'Nothing needs you right now.' }
}
