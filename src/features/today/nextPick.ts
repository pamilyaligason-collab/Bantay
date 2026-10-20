import { clock } from '../health/model'
import { dayOf, matchDoses, slotsFor, type MedSlot } from '../health/meds'
import type { MedTaken, Medication } from '../log/store'
import type { HeroCard } from './heroCards'

/** Next up: ONE item. Medicine due soon or just missed (mine or someone I care for) > plan item due today > storm within 500 km > all clear.
 *  Weather is never picked here: it has its own card on Today. */

export const UPCOMING_MIN = 180 // a dose is "next" from 3 hours before its time ...
export const MISSED_MIN = 120 // ... and stays on the card for 2 hours after it

export interface DoseTarget { personId: string; name: string; isMe: boolean }
export interface DuePerson extends DoseTarget {
  at: number // minutes after local midnight of the earliest open dose
  status: 'upcoming' | 'missed'
  /** The open doses at that time (one per medicine). */
  slots: MedSlot[]
}
export type NextKind = 'dose' | 'plan' | 'storm' | 'calm'
export interface NextItem { key: string; kind: NextKind; kicker: string; title: string; body: string; who?: DuePerson; href?: string; linkLabel?: string }

type Take = Pick<MedTaken, 'personId' | 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>

/** Per person, the earliest open dose that is due within 3 hours or was missed within the last 2. Earliest time first, me first on a tie. */
export function nextDoses(people: DoseTarget[], meds: Medication[], takes: Take[], now: Date): DuePerson[] {
  const day = dayOf(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return people.flatMap((p): DuePerson[] => {
    const open = matchDoses(slotsFor(meds, p.personId, day), takes.filter((t) => t.personId === p.personId), day)
      .filter((d) => d.state === 'pending' && d.at - nowMin <= UPCOMING_MIN && nowMin - d.at <= MISSED_MIN)
    if (!open.length) return []
    const at = open[0]!.at // matchDoses keeps the slot order: earliest first
    return [{ ...p, at, status: at < nowMin ? 'missed' : 'upcoming', slots: open.filter((d) => d.at === at) }]
  }).sort((a, b) => a.at - b.at || Number(b.isMe) - Number(a.isMe))
}

export const joinNames = (n: string[]) => (n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

export function pickNext(i: { due: DuePerson[]; plan: HeroCard | null; storm: { title: string; body: string } | null }): NextItem {
  const d = i.due[0]
  if (d) {
    const names = [...new Set(d.slots.map((s) => s.name))]
    const others = [...new Set(i.due.slice(1).map((o) => o.name))]
    const more = others.length ? ` Also waiting: ${joinNames(others)}.` : ''
    const title = d.isMe ? `Time for ${joinNames(names)}` : `${d.name}: ${joinNames(names)}`
    const missed = d.status === 'missed'
    return { key: `dose:${d.personId}:${d.at}`, kind: 'dose', kicker: `${missed ? 'Not taken yet' : 'Medicine'} · ${clock(d.at)}`, title, body: `${missed ? 'This dose is waiting.' : 'Coming up soon.'}${more}`, who: d }
  }
  const p = i.plan
  if (p) return { key: p.key, kind: 'plan', kicker: p.kicker, title: p.title, body: p.body, href: '#family/plan', linkLabel: 'Open plan' }
  if (i.storm) return { key: 'storm', kind: 'storm', kicker: 'Storm nearby', title: i.storm.title, body: i.storm.body, href: '#safety/storms', linkLabel: 'Storm tracker' }
  return { key: 'calm', kind: 'calm', kicker: 'Next up', title: 'All clear', body: 'Nothing needs you right now.' }
}
