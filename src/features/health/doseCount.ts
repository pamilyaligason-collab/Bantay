import type { MedTaken, Medication } from '../log/store'
import { dayOf, slotsFor } from './meds'

/** The ONE dose counter. Denominator = scheduled doses already due in the chosen days: a past slot always counts; today's slot counts once taken on time or once its 2 hours have passed.
 *  A dose is on time when taken within 2 hours of its slot (H1). A medicine counts from its first day (started on, else its first take, else today). Skipped takes never count as taken. Pure. */
export const ON_TIME_MIN = 120
export interface DoseCount { done: number; want: number; pct: number | null; perDay: (number | null)[] }

const key = (m: Medication) => m.serverId ?? m.clientId ?? String(m.id ?? m.name)
const lc = (s: string) => s.trim().toLowerCase()

/** `days` are local day strings (yyyy-mm-dd), oldest first. */
export function countDoses(i: { meds: Medication[]; takes: MedTaken[]; personId: string; now: Date; days: string[] }): DoseCount {
  const today = dayOf(i.now)
  const mine = i.takes.filter((t) => t.personId === i.personId && !t.skipped)
  const firstDay = new Map<string, string>()
  for (const m of i.meds) {
    if (m.personId !== i.personId) continue
    const taken = mine.filter((t) => (m.serverId && t.medicationId === m.serverId) || (!t.medicationId && lc(t.name) === lc(m.name))).map((t) => dayOf(t.takenAt)).sort()[0]
    firstDay.set(key(m), m.startedOn?.slice(0, 10) ?? taken ?? today)
  }
  const used = new Set<MedTaken>() // one take serves one slot, even across midnight
  let want = 0
  let done = 0
  const perDay = i.days.map((d) => {
    let dayWant = 0
    let dayDone = 0
    for (const sl of slotsFor(i.meds, i.personId, d)) {
      if (d < (firstDay.get(sl.key) ?? today)) continue
      const slotMs = new Date(`${d}T00:00:00`).getTime() + sl.at * 60_000 // real time, so a take across midnight still matches (PH has no DST)
      const hit = mine.filter((t) => !used.has(t) && (sl.medicationId ? t.medicationId === sl.medicationId && t.slot === sl.slot : !t.medicationId && lc(t.name) === lc(sl.name)))
        .map((t) => ({ t, gap: Math.abs(Date.parse(t.takenAt) - slotMs) / 60_000 })).filter((x) => x.gap <= ON_TIME_MIN).sort((a, b) => a.gap - b.gap)[0]
      if (hit) used.add(hit.t)
      else if (slotMs + ON_TIME_MIN * 60_000 > i.now.getTime()) continue // still inside its 2 hours
      dayWant++
      if (hit) dayDone++
    }
    want += dayWant
    done += dayDone
    return dayWant ? dayDone : null
  })
  return { done, want, pct: want ? Math.round((done / want) * 100) : null, perDay }
}
