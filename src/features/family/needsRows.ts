import { shortMedName } from '../health/medName'
import { shortName } from '../inbox/build'
import type { AlertRow } from '../notify/store'
import type { ReviewAsk } from './CarerCards'
import type { FamilyPerson } from './roster'
import type { PersonFocus } from './useFocuses'

export interface NeedRow { id: string; person: FamilyPerson | undefined; title: string; sub: string; action: { kind: 'answer'; ask: ReviewAsk } | { kind: 'phone'; alertId: string } | { kind: 'open'; href: string } }

/** What still needs you that the Today cards do not already say. A person's card shows their ONE top item (unwell, missed dose, questions), so the list holds only the rest:
 *  questions for someone whose card shows something more urgent, missed doses behind "not feeling well", and every "phone may miss alarms" (a card never carries those). Same person + same kind never appears in both. */
export function needsRows(items: PersonFocus[], phoneAlerts: AlertRow[], people: FamilyPerson[]): NeedRow[] {
  const out: NeedRow[] = []
  for (const it of items) {
    const name = shortName(it.person.name) ?? 'Someone'
    if (it.asks.length && it.focus.kind !== 'questions') {
      const a = it.asks[0]!
      out.push({ id: `q|${it.person.id}`, person: it.person, title: `${name}: ${it.asks.length} ${it.asks.length === 1 ? 'question' : 'questions'}`, sub: `Still taking ${shortMedName(a.med.name)}? · ${a.days === 1 ? 'yesterday' : `${a.days} days`}`, action: { kind: 'answer', ask: a } })
    }
    if (it.missedDoses.length && it.focus.kind !== 'missed') out.push({ id: `d|${it.person.id}`, person: it.person, title: `${name}: missed ${it.missedDoses.length === 1 ? 'a medicine' : `${it.missedDoses.length} doses`}`, sub: 'Open to mark it', action: { kind: 'open', href: `#family/people/${it.person.id}` } })
  }
  const seen = new Set<string>()
  for (const r of phoneAlerts) {
    if (!r.personId || seen.has(r.personId)) continue
    seen.add(r.personId)
    const p = people.find((x) => x.id === r.personId)
    out.push({ id: `p|${r.id}`, person: p, title: `${shortName(p?.name) ?? 'Someone'}'s phone may miss alarms`, sub: 'Open the phone list to see which setting to fix.', action: { kind: 'phone', alertId: r.id } })
  }
  return out
}
