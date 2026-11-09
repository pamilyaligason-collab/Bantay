import { localDay, type Activity } from '../model'

/** Steps per local day (days with no steps row have no entry). */
export function stepDays(acts: Activity[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of acts) if (a.kind === 'steps' && typeof a.steps === 'number' && Number.isFinite(a.steps) && !Number.isNaN(Date.parse(a.startedAt))) m.set(localDay(a.startedAt), (m.get(localDay(a.startedAt)) ?? 0) + a.steps)
  return m
}
const mean = (v: number[]) => (v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : null)

export interface StepsSummary { today: number | null; avg30: number | null; month: number | null; year: number | null; monthDays: number }
/** Today, the 30-day average, this calendar month and this calendar year, each a mean over the days that have data (null = nothing yet, never 0). */
export function stepsSummary(acts: Activity[], now: Date): StepsSummary {
  const days = stepDays(acts)
  const today = localDay(now.toISOString())
  const from30 = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 12).toISOString())
  const within = (pred: (k: string) => boolean) => [...days.entries()].filter(([k]) => k <= today && pred(k)).map(([, v]) => v)
  return {
    monthDays: within((k) => k.slice(0, 7) === today.slice(0, 7)).length,
    today: days.get(today) ?? null,
    avg30: mean(within((k) => k >= from30)),
    month: mean(within((k) => k.slice(0, 7) === today.slice(0, 7))),
    year: mean(within((k) => k.slice(0, 4) === today.slice(0, 4)))
  }
}

/** "This month: 2,740 steps a day, lower than your average this year (9,544)." (within 5% is "about the same as"). null when either is missing or the month has fewer than 7 days of data (one day against a year is noise). */
export function monthVsYear(month: number | null, year: number | null, monthDays = 7): string | null {
  if (month == null || year == null || year <= 0 || monthDays < 7) return null
  const rel = Math.abs(month - year) / year < 0.05 ? 'about the same as' : month < year ? 'lower than' : 'higher than'
  return `This month: ${month.toLocaleString('en-US')} steps a day, ${rel} your average this year (${year.toLocaleString('en-US')}).`
}

export interface FamilyRow { id: string; name: string; isMe: boolean; steps: number | null }
/** Family today: only people in `allowed` (the D-109 "who sees whom" set the Family screens already use) get a row, whatever else is on this phone. Steps are null when none were recorded today. */
export function familyRows(candidates: { id: string; name: string; isMe: boolean }[], allowed: ReadonlySet<string>, stepsToday: Record<string, number | null>): FamilyRow[] {
  return candidates.filter((p) => allowed.has(p.id)).map((p) => ({ id: p.id, name: p.name, isMe: p.isMe, steps: stepsToday[p.id] ?? null }))
}
