import type { Tint } from '../look'
import { dayOf } from '../health/meds'
import { shortMedName } from '../health/medName'
import { slotAgo, type ReviewAsk } from './CarerCards'
import { lastCheckInWords } from './FacesRow'
import { checkInLabel, dial, type FamilyPerson } from './roster'
import type { DoseLine } from './MemberPage'

export type FocusKind = 'unwell' | 'missed' | 'questions' | 'due' | 'nocheck' | 'ok'
export interface Focus {
  kind: FocusKind
  tint: Tint
  line: string
  body: string
  action: { label: string; kind: 'call' | 'mark' | 'answer' | 'message' | 'open' } | null
}
export interface FocusData {
  unwell: boolean
  missed: DoseLine[]
  due: DoseLine[]
  later: number
  asks: ReviewAsk[]
  checkIn: string | undefined
  canMark: boolean
  now: Date
}

const slotOf = (d: DoseLine) => d.key.split('|').pop() ?? ''
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** The one thing to say about a person today (first match wins): not well, a missed dose, questions waiting, a dose due now, no check-in, else all fine. Pure: `now` is passed in (ML-32). */
export function personFocus(p: Pick<FamilyPerson, 'id' | 'name' | 'isMe' | 'phone'>, d: FocusData): Focus {
  const open: Focus['action'] = { label: 'Open', kind: 'open' }
  if (d.unwell) {
    const num = dial(p.phone)
    return { kind: 'unwell', tint: 'red', line: 'Not feeling well', body: 'They chose Not feeling well in How are you?', action: p.isMe ? open : num ? { label: 'Call', kind: 'call' } : { label: 'Message', kind: 'message' } }
  }
  if (d.missed.length) {
    const first = d.missed[0]!
    const ago = slotAgo(dayOf(d.now), slotOf(first), d.now)
    const more = d.later + d.missed.length - 1
    return {
      kind: 'missed', tint: 'red',
      line: d.missed.length === 1 ? 'Missed a medicine' : `Missed ${d.missed.length} medicines`,
      body: `${first.name} was due ${first.time}${ago ? `, ${ago}` : ''}.${more > 0 ? ` ${plural(more, 'other dose')} not marked yet.` : ''}`,
      action: d.canMark && !p.isMe ? { label: 'Mark taken', kind: 'mark' } : open
    }
  }
  if (d.asks.length) {
    const a = d.asks[0]!
    const when = a.days === 1 ? 'yesterday' : `${a.days} days ago`
    return {
      kind: 'questions', tint: 'amber',
      line: `${plural(d.asks.length, 'question')} waiting`,
      body: d.asks.length === 1 ? `"Still taking ${shortMedName(a.med.name)}?" asked ${when}.` : `"Still taking ${shortMedName(a.med.name)}?" and ${d.asks.length - 1} more, asked ${when}.`,
      action: d.canMark && !p.isMe ? { label: 'Answer', kind: 'answer' } : open
    }
  }
  if (d.due.length) {
    const first = d.due[0]!
    return { kind: 'due', tint: 'amber', line: `${plural(d.due.length, 'medicine')} at ${first.time}`, body: `Due now. ${d.later > 0 ? `${plural(d.later, 'more dose')} later today.` : ''}`.trim(), action: open }
  }
  const c = checkInLabel(d.checkIn, d.now)
  if (!c.ok) return { kind: 'nocheck', tint: 'none', line: 'No check-in today', body: lastCheckInWords(d.checkIn, d.now), action: p.isMe ? open : dial(p.phone) ? { label: 'Message', kind: 'message' } : open }
  return { kind: 'ok', tint: 'none', line: c.text, body: 'Nothing waiting.', action: open }
}

const RANK: Record<Tint, number> = { red: 0, amber: 1, blue: 2, teal: 2, purple: 2, green: 2, none: 3 }
/** Red first, then amber, then the rest; ties keep the roster order (stable sort). */
export function sortByFocus<T extends { focus: Pick<Focus, 'tint'> }>(cards: T[]): T[] {
  return cards.map((c, i) => ({ c, i })).sort((a, b) => RANK[a.c.focus.tint] - RANK[b.c.focus.tint] || a.i - b.i).map((x) => x.c)
}
