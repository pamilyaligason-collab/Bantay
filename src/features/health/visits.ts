import { dayOf } from './meds'
import type { Appointment, FollowUp } from './visitsStore'

/** Doctor visits from the synced appointments and the prescriptions' follow-up dates. Pure. Nothing here is written to the server. */
export interface Visit {
  kind: 'visit' | 'followup'
  key: string
  personId: string
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  /** Exact time when the appointment has one. */
  at: Date | null
  title: string
  sub: string
  /** An appointment with a date but no time ("follow up in 2 weeks"). */
  dateOnly: boolean
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parseDay = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`)
export const dayWords = (day: string) => { const d = parseDay(day); return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` }
export const monthDay = (day: string) => { const d = parseDay(day); return { mon: MO[d.getMonth()]!.toUpperCase(), num: String(d.getDate()) } }
export const timeWords = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`

const live = (a: Appointment) => a.status !== 'rejected' && a.apptStatus !== 'cancelled'

function toVisit(a: Appointment): Visit | null {
  const at = a.startsAt && !Number.isNaN(Date.parse(a.startsAt)) ? new Date(a.startsAt) : null
  const day = at ? dayOf(at) : a.dueOn ? a.dueOn.slice(0, 10) : ''
  if (!day) return null
  const where = [a.provider, a.facility].filter(Boolean).join(', ')
  return {
    kind: 'visit', key: a.clientId ?? `${a.personId}:${day}:${a.purpose ?? ''}`, personId: a.personId, day, at, dateOnly: !at,
    title: a.purpose?.trim() || 'Doctor visit',
    sub: [at ? `${dayWords(day)} ${timeWords(at)}` : dayWords(day), where].filter(Boolean).join(' · ')
  }
}

export interface VisitList {
  next: Visit | null
  upcoming: Visit[]
  past: Visit[]
  /** Follow-up dates from prescriptions with no appointment behind them. */
  followUps: Visit[]
}

export function visitList(appts: Appointment[], rx: FollowUp[], personId: string, now: Date): VisitList {
  const today = dayOf(now)
  const mine = appts.filter((a) => a.personId === personId && live(a))
  const all = mine.map(toVisit).filter((v): v is Visit => !!v)
  const open = (a: Appointment) => (a.apptStatus ?? 'planned') === 'planned'
  const upcoming = mine.filter(open).map(toVisit).filter((v): v is Visit => !!v && v.day >= today).sort((a, b) => (a.at?.getTime() ?? parseDay(a.day).getTime()) - (b.at?.getTime() ?? parseDay(b.day).getTime()))
  const past = all.filter((v) => !upcoming.some((u) => u.key === v.key)).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 5)
  const covered = (r: FollowUp) => mine.some((a) => open(a) && ((r.serverId && a.sourcePrescriptionId === r.serverId) || (toVisit(a)?.day ?? '') === (r.followUpOn ?? '').slice(0, 10)))
  const followUps = rx
    .filter((r) => r.personId === personId && r.status === 'confirmed' && !!r.followUpOn && r.followUpOn.slice(0, 10) >= today && !covered(r)) // confirmed prescriptions only; a date that has passed is not "due"
    .map((r): Visit => ({
      kind: 'followup', key: r.clientId ?? `rx:${r.serverId}`, personId, day: r.followUpOn!.slice(0, 10), at: null, dateOnly: true,
      title: 'Follow-up due', sub: [dayWords(r.followUpOn!), r.prescriber ? `from ${r.prescriber}'s prescription` : 'from a prescription'].join(' · ')
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
  return { next: upcoming[0] ?? null, upcoming, past, followUps }
}

/** The "Next visit" line for the Health overview: the next appointment, else the nearest follow-up. null when there is neither. */
export function nextVisitLine(l: VisitList): { text: string; sub: string } | null {
  if (l.next) return { text: `Next visit: ${l.next.sub.split(' · ')[0]}`, sub: l.next.title }
  const f = l.followUps[0]
  return f ? { text: `Follow-up due: ${dayWords(f.day)}`, sub: 'No visit booked yet' } : null
}

export interface BringItem { id: string; label: string }
/** What to take to the visit: the 30-day readings, the medicine list, papers, then the person's own questions. */
export function bringList(i: { hasReadings: boolean; questions: string[] }): BringItem[] {
  return [
    { id: 'readings', label: i.hasReadings ? 'BP and sugar log (last 30 days)' : 'Your home readings, if you have them' },
    { id: 'meds', label: 'Medicine list' },
    { id: 'papers', label: 'Recent lab results and prescriptions' },
    ...i.questions.map((q, n) => ({ id: `q${n}`, label: `Question: ${q}` }))
  ]
}
