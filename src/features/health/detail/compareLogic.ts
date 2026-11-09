import { stepDays } from './activityLogic'
import { localDay, type Activity } from '../model'

/** Activity compare (steps page): me against the Bantay goal, one chosen member and the family. Pure. */
export const MIN_COMPARE_DAYS = 7
export interface ThirtyDay { avg: number | null; days: number }

/** Mean steps a day over the last 30 local days, on the days that have steps, and how many such days there were. null average when none (never 0). */
export function thirtyDay(acts: Activity[], now: Date): ThirtyDay {
  const today = localDay(now.toISOString())
  const from30 = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 12).toISOString())
  const v = [...stepDays(acts).entries()].filter(([k]) => k >= from30 && k <= today).map(([, n]) => n)
  return { avg: v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : null, days: v.length }
}

const ok = (t: ThirtyDay | null | undefined): t is { avg: number; days: number } => !!t && t.avg != null && t.avg > 0 && t.days >= MIN_COMPARE_DAYS // fewer than 7 days of data is noise: no comparison
/** "higher than", "lower than" or "about the same as" (within 5%), mine against theirs. */
export const relTo = (mine: number, other: number) => (Math.abs(mine - other) / other < 0.05 ? 'about the same as' : mine < other ? 'lower than' : 'higher than')

/** Average of the people with 7 or more days of data (the viewer included), and how many people it covers. null average when nobody qualifies. */
export function familyAverage(all: ThirtyDay[]): { avg: number | null; people: number } {
  const v = all.filter(ok).map((t) => t.avg)
  return { avg: v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : null, people: v.length }
}

export interface CompareRow { id: 'goal' | 'member' | 'family'; title: string; value: string; line: string }
const n = (v: number) => v.toLocaleString('en-US')

/** Whose steps `me` holds: the signed-in viewer ("Your average") or the person they are looking at (given name, "Their" when unknown). */
export interface Subject { viewer: boolean; name?: string }
const poss = (s: Subject) => (s.viewer ? 'Your' : s.name ? `${s.name}'s` : 'Their')

/** The comparisons for the steps page. `me` is the VIEWED person's 30-day steps (the viewer's own only when they look at themself). Every row needs 7 or more days of theirs and, for the others, of the other person's; a row that cannot be backed by data is left out.
 *  `member` and `others` are only people the viewer may already see (D-109); `others` never holds the viewed person (no double count) and holds the viewer when visible.
 *  The goal is Bantay's own default (STEP_GOAL): no outside recommendation is quoted because none was verified. */
export function compareRows(i: { me: ThirtyDay; who?: Subject; member?: { name: string; isYou?: boolean; t: ThirtyDay } | null; others: ThirtyDay[]; goal: number }): CompareRow[] {
  if (!ok(i.me)) return []
  const w = poss(i.who ?? { viewer: true })
  const out: CompareRow[] = [{ id: 'goal', title: 'Bantay goal', value: n(i.goal), line: `${w} average of ${n(i.me.avg)} steps a day is ${relTo(i.me.avg, i.goal)} the Bantay goal of ${n(i.goal)}. That is Bantay's own default, not a medical target.` }]
  if (i.member && ok(i.member.t)) out.push({ id: 'member', title: i.member.isYou ? 'You' : i.member.name, value: n(i.member.t.avg), line: `${w} average is ${relTo(i.me.avg, i.member.t.avg)} ${i.member.isYou ? 'yours' : `${i.member.name}'s`} (${n(i.member.t.avg)} a day).` })
  const fam = familyAverage([i.me, ...i.others])
  if (fam.avg != null && fam.people >= 2) out.push({ id: 'family', title: 'Family average', value: n(fam.avg), line: `${w} average is ${relTo(i.me.avg, fam.avg)} the family average (${n(fam.avg)} a day, from ${fam.people} people).` })
  return out
}
