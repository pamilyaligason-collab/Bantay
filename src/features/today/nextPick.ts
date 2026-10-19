import { clock, doseStates, medSlots, sameName } from '../health/model'
import { HEAT_C, doseKey, isSkipped, RAIN_HERO_PCT, heroCards, type HeroCard, type Sky, type Wx } from './heroCards'

/** Next up: ONE item. Due medicine (mine or someone I care for) > plan item due today > nearby storm > weather only when it is rainy or hot > all clear. */

export interface DuePerson { personId: string; name: string; isMe: boolean; meds: string[]; at: number; skipKeys: string[] }
export interface DueInput { personId: string; name: string; isMe: boolean; entries: string[] }
export type NextKind = 'dose' | 'plan' | 'storm' | 'weather' | 'calm'
export interface NextItem { key: string; kind: NextKind; sky?: Sky; kicker: string; title: string; body: string; big?: string; who?: DuePerson; href?: string; linkLabel?: string }

const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes()

/** Who has a timed medicine whose time has passed and is not taken (or skipped) today. Me first, then the oldest dose. */
export function dueMeds(people: DueInput[], taken: { personId: string; name: string; takenAt: string }[], skipped: string[], now: Date): DuePerson[] {
  const nowMin = minutes(now)
  return people.flatMap((p): DuePerson[] => {
    const states = doseStates(medSlots(p.entries), taken.filter((t) => t.personId === p.personId), now)
    const open = states.filter((s) => s.at != null && s.at <= nowMin && !s.taken)
    const first = (n: string) => Math.min(...open.filter((d) => sameName(d.name, n)).map((d) => d.at!))
    const due = open.filter((s) => !(p.isMe && isSkipped(skipped, s.name, s.at!, first(s.name))))
    if (!due.length) return []
    return [{ personId: p.personId, name: p.name, isMe: p.isMe, meds: [...new Set(due.map((d) => d.name))], at: Math.min(...due.map((d) => d.at!)), skipKeys: due.map((d) => doseKey(d.name, d.at!)) }]
  }).sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.at - b.at)
}

export const joinNames = (n: string[]) => (n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

export function pickNext(i: { due: DuePerson[]; plan: HeroCard | null; storm: { title: string; body: string } | null; weather: Wx | null; placeName: string; now: Date }): NextItem {
  const d = i.due[0]
  if (d) {
    const others = i.due.slice(1).map((o) => o.name)
    const more = others.length ? ` Also waiting: ${joinNames(others)}.` : ''
    const title = d.isMe ? `Time for ${joinNames(d.meds)}` : `${d.name}: ${joinNames(d.meds)}`
    return { key: `dose:${d.personId}`, kind: 'dose', kicker: `Medicine · due ${clock(d.at)}`, title, body: `Not taken yet.${more}`, who: d }
  }
  const p = i.plan
  if (p) return { key: p.key, kind: 'plan', kicker: p.kicker, title: p.title, body: p.body, href: '#family/plan', linkLabel: 'Open plan' }
  if (i.storm) return { key: 'storm', kind: 'storm', kicker: 'Storm nearby', title: i.storm.title, body: i.storm.body, href: '#safety/storms', linkLabel: 'Storm tracker' }
  const w = i.weather
  if (w && w.temp != null && ((w.rainPct != null && w.rainPct >= RAIN_HERO_PCT) || w.temp >= HEAT_C)) {
    const c = heroCards({ alerts: [], ref: null, doses: [], weather: w, placeName: i.placeName, now: i.now }).find((x) => x.kind === 'weather')
    if (c) return { key: c.key, kind: 'weather', sky: c.sky, kicker: c.kicker, title: c.title, body: c.body, big: c.big }
  }
  return { key: 'calm', kind: 'calm', kicker: 'Next up', title: 'All clear', body: 'Nothing needs you right now.' }
}
