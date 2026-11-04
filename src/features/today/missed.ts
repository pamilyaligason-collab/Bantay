import { showsAsCard } from '../family/CarerCards'
import type { AlertRow } from '../notify/store'

export interface Missed { personId: string; alertIds: string[]; time: string | null }

/** "9:00" -> "9:00 AM". The alert ref is `<person>:<yyyy-mm-dd>:<HH>:<MM>` (the dose slot); anything else gives null, never a made-up time. */
export function slotTime(ref: string | null): string | null {
  const m = /:(\d{2}):(\d{2})$/.exec(ref ?? '')
  if (!m) return null
  const h = Number(m[1])
  return h < 24 && Number(m[2]) < 60 ? `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}` : null
}

/** One entry per person with an unseen missed-dose alert for today (the same showsAsCard rule as the Family cards): `time` is the newest slot, `alertIds` every unseen one, so Open clears them all. */
export function missedDoses(rows: AlertRow[], now: Date = new Date()): Missed[] {
  const out: Missed[] = []
  for (const r of [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    if (r.kind !== 'dose_missed' || r.seenAt != null || !r.personId || !showsAsCard(r.ref, now)) continue
    const have = out.find((m) => m.personId === r.personId)
    if (have) have.alertIds.push(r.id)
    else out.push({ personId: r.personId, alertIds: [r.id], time: slotTime(r.ref) })
  }
  return out
}
