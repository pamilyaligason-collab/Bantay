import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { showsAsCard } from '../family/CarerCards'
import { tzMidnight, zoneOf } from '../time/zone'
import { manilaDay, matchDoses, slotsFor } from '../health/meds'
import { doseRef } from '../inbox/MissedDoseActions'
import { ldb } from '../log/store'
import { DOSE_RETRY_MS } from '../../../supabase/functions/dose-watch/logic'
import { markSeen, type AlertRow } from '../notify/store'

/** D-145: one entry per person and loudness. `quiet` = every alert in it belongs to a dose whose notifications are spent: the server pushes a missed dose once per carer and offers it again for
 *  at most MISSED_QUIET_MS (dose-watch DOSE_RETRY_MS), so after that no more alert will come and Today folds the row ("Missed, no more reminders"). Family keeps listing it until it is marked. */
export interface Missed { personId: string; alertIds: string[]; time: string | null; quiet: boolean }
export const MISSED_QUIET_MS = DOSE_RETRY_MS // one constant, imported from the server's logic.ts, so the app and dose-watch cannot drift

/** "9:00" -> "9:00 AM". The alert ref is `<person>:<yyyy-mm-dd>:<HH>:<MM>` (the dose slot); anything else gives null, never a made-up time. */
export function slotTime(ref: string | null): string | null {
  const m = /:([01]\d|2[0-3]):([0-5]\d)$/.exec(ref ?? '')
  if (!m) return null
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** One entry per person and loudness with an unseen missed-dose alert for today (the same showsAsCard rule as the Family cards): `time` is the newest slot, `alertIds` every unseen one of that entry.
 *  A dose is quiet once its newest alert (seen or not) is MISSED_QUIET_MS old. */
export function missedDoses(rows: AlertRow[], now: Date = new Date(), final: ReadonlySet<string> = new Set()): Missed[] {
  const today = (r: AlertRow) => r.kind === 'dose_missed' && !!r.personId && showsAsCard(r.ref, now, zoneOf(r.personId))
  const dose = (r: AlertRow) => `${r.personId}|${doseRef(r.ref).slot ?? r.id}` // a ref with no slot is its own dose
  const at = (r: AlertRow) => { const t = Date.parse(r.createdAt); return Number.isNaN(t) ? now.getTime() : t } // unknown age is fresh, never old (ML-05): a bad stamp must not fold a row nobody has seen
  const last = new Map<string, number>()
  for (const r of rows) if (today(r)) last.set(dose(r), Math.max(last.get(dose(r)) ?? 0, at(r)))
  const out: Missed[] = []
  for (const r of [...rows].sort((a, b) => at(b) - at(a))) {
    if (!today(r) || r.seenAt != null || final.has(r.id)) continue // `final`: the dose is already taken or skipped, so the row is gone
    const quiet = now.getTime() - (last.get(dose(r)) ?? now.getTime()) >= MISSED_QUIET_MS
    const have = out.find((m) => m.personId === r.personId && m.quiet === quiet)
    if (have) have.alertIds.push(r.id)
    else out.push({ personId: r.personId!, alertIds: [r.id], time: slotTime(r.ref), quiet })
  }
  return out
}

/** The missed-dose rows to show on Today. A row stays until its dose is marked taken or skipped by anyone (read from the doses on this phone, as the Family card does), then
 *  its alerts are marked seen. Opening it never does that (D-145). Unknown is not final: until the phone's doses are read, nothing resolves.
 *  The day is the Manila dose day of the server's refs, never this phone's midnight. */
export function useMissedToday(rows: AlertRow[]): Missed[] {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000)) // a dose goes quiet with the clock, so re-read it each minute
  useEffect(() => { const t = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000); return () => clearInterval(t) }, [])
  const now = new Date()
  const open = useMemo(() => missedDoses(rows, now), [rows, minute]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = [...new Set(open.map((m) => m.personId))].join(',')
  const [final, setFinal] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (!key) return setFinal(new Set())
    const ids = key.split(',')
    const since = () => tzMidnight(manilaDay(new Date())).toISOString()
    const sub = liveQuery(async () => ({ meds: await ldb.medications.where('personId').anyOf(ids).toArray(), takes: await ldb.meds.where('takenAt').aboveOrEqual(since()).filter((t) => ids.includes(t.personId)).toArray() })).subscribe({
      next: ({ meds, takes }) => {
        const day = manilaDay(new Date()), done = new Set<string>()
        for (const r of rows) {
          const { slot } = doseRef(r.ref)
          if (r.kind !== 'dose_missed' || r.seenAt != null || !r.personId || !slot || !ids.includes(r.personId) || !showsAsCard(r.ref, undefined, zoneOf(r.personId))) continue
          const mine = meds.filter((m) => m.personId === r.personId)
          if (mine.length && !matchDoses(slotsFor(mine, r.personId, day), takes.filter((t) => t.personId === r.personId), day, manilaDay).some((d) => d.slot === slot && d.state === 'pending')) done.add(r.id)
        }
        setFinal(done)
        for (const id of done) void markSeen(id).catch(() => undefined)
      },
      error: () => setFinal(new Set())
    })
    return () => sub.unsubscribe()
  }, [key, rows])
  return useMemo(() => missedDoses(rows, now, final), [rows, final, minute]) // eslint-disable-line react-hooks/exhaustive-deps
}
