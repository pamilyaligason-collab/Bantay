import { dayKey, eventDay, weekOf } from './events'
import type { FamilyEvent, FamilyNote, FamilyTask } from './store'

export type PlanTab = 'today' | 'week' | 'later' | 'done'
export type PlanRow =
  | { kind: 'task'; key: string; day: string | null; sort: string; overdue: boolean; task: FamilyTask }
  | { kind: 'event'; key: string; day: string; sort: string; overdue: false; event: FamilyEvent }
  | { kind: 'note'; key: string; day: null; sort: string; overdue: false; note: FamilyNote }

const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00`); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)) }
const localTime = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** Split the plan into Today / This week / Later / Done by the phone's local day (the family lives in the Philippines, so that is Manila).
 *  Today also holds overdue tasks and pinned notes. This week is tomorrow to Sunday. Later is the rest, plus undated tasks and loose notes.
 *  Done holds ticked tasks and events from earlier days (newest first). */
export function groupPlan(tasks: FamilyTask[], events: FamilyEvent[], notes: FamilyNote[], now: Date): Record<PlanTab, PlanRow[]> {
  const today = dayKey(now)
  const sunday = dayKey(weekOf(now)[6]!)
  const out: Record<PlanTab, PlanRow[]> = { today: [], week: [], later: [], done: [] }
  const place = (day: string | null): PlanTab => (day == null ? 'later' : day <= today ? 'today' : day <= sunday ? 'week' : 'later')

  for (const t of tasks) {
    const row: PlanRow = { kind: 'task', key: t.clientId, day: t.due, sort: `${t.due ?? '9999-99-99'} 99:99 ${t.title}`, overdue: !t.done && !!t.due && t.due < today, task: t }
    out[t.done ? 'done' : place(t.due)].push(row)
  }
  for (const e of events) {
    const day = eventDay(e)
    const row: PlanRow = { kind: 'event', key: e.clientId, day, sort: `${day} ${e.allDay ? '00:00' : localTime(e.startsAt)} ${e.title}`, overdue: false, event: e }
    out[day < today ? 'done' : place(day)].push(row)
  }
  for (const n of notes) out[n.pinned ? 'today' : 'later'].push({ kind: 'note', key: n.clientId, day: null, sort: String(n.id ?? 0).padStart(9, '0'), overdue: false, note: n })

  const lead = (r: PlanRow) => (r.kind === 'note' && r.note.pinned ? 0 : 1) // pinned notes lead Today
  for (const tab of ['today', 'week', 'later'] as const) out[tab].sort((a, b) => lead(a) - lead(b) || a.sort.localeCompare(b.sort))
  out.done.sort((a, b) => b.sort.localeCompare(a.sort))
  return out
}

export type WhenPick = 'today' | 'tomorrow' | 'weekend' | 'date' | 'none'
/** The day a quick pick means. This weekend is the coming Saturday (today when it is already Saturday or Sunday). null for "No date" and "Pick date". */
export function pickDay(p: WhenPick, now: Date): string | null {
  const today = dayKey(now)
  if (p === 'today') return today
  if (p === 'tomorrow') return addDays(today, 1)
  if (p === 'weekend') { const dow = now.getDay(); return dow === 0 || dow === 6 ? today : addDays(today, 6 - dow) }
  return null
}

export type Repeat = 'none' | 'daily' | 'weekly'
// shortcut: no repeat column exists (no migration this wave), so a repeat is written as separate rows ahead of time. Upgrade when the table gets a rule.
const SPAN = { daily: { n: 14, step: 1 }, weekly: { n: 8, step: 7 } } as const
/** The days a new item lands on: just the start day, or the next 14 days / 8 weeks. */
export const repeatDays = (start: string, r: Repeat): string[] => (r === 'none' ? [start] : Array.from({ length: SPAN[r].n }, (_, i) => addDays(start, i * SPAN[r].step)))

/** "Today", "Tomorrow", else "Fri 23 Oct". */
export function dayLabel(day: string, now: Date): string {
  const today = dayKey(now)
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  return new Date(`${day}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}
