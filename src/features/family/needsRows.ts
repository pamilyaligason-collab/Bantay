import { shortName } from '../inbox/build'
import type { AlertRow } from '../notify/store'
import type { ReviewAsk } from './CarerCards'
import type { FamilyPerson } from './roster'
import type { PersonFocus } from './useFocuses'

export interface NeedRow { id: string; person: FamilyPerson | undefined; title: string; sub: string; action: { kind: 'answer'; ask: ReviewAsk } | { kind: 'phone'; alertId: string } | { kind: 'select'; personId: string } }

/** What still needs you on the Family root (D-109). Other people's cards are not on the page, so a writer carer keeps the glance here: "Ma: missed a medicine", with no medicine name and no number, and Open puts that person on show.
 *  The caller passes only you and the people you are a writer carer of (Family's Root filters before it gets here). Also: unanswered "Still taking it?" questions (no medicine name either) unless that person's card is on show and already says so, and every "phone may miss alarms" (a card never carries those). */
export function needsRows(items: PersonFocus[], phoneAlerts: AlertRow[], people: FamilyPerson[], shownId?: string, cardIds: string[] = []): NeedRow[] {
  const out: NeedRow[] = []
  for (const it of items) {
    const name = shortName(it.person.name) ?? 'Someone'
    if (it.asks.length && !(it.person.id === shownId && it.focus.kind === 'questions')) {
      const a = it.asks[0]!
      out.push({ id: `q|${it.person.id}`, person: it.person, title: `${name}: ${it.asks.length} ${it.asks.length === 1 ? 'question' : 'questions'}`, sub: `Asked ${a.days === 1 ? 'yesterday' : `${a.days} days ago`}`, action: { kind: 'answer', ask: a } })
    }
    if (it.missedDoses.length && !it.person.isMe && !(it.focus.kind === 'missed' && cardIds.includes(it.person.id))) out.push({ id: `d|${it.person.id}`, person: it.person, title: `${name}: missed a medicine`, sub: 'Open to see which one', action: { kind: 'select', personId: it.person.id } })
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
