import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { ldb, logDose } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import { dayOf, remindable, toClock } from './meds'

/** Lock-screen actions on a dose reminder: Taken / Snooze 15 min / Open. "Taken" logs the doses due at that time without opening the app; "Snooze" rings once more in 15 minutes.
 *  The notification text is set in reminders.ts; this file only adds the buttons and what they do. Native only (the web has no lock screen). */
export const DOSE_ACTION_TYPE = 'DOSE_REMINDER'
export const SNOOZE_MIN = 15
const REMIND_FOR_KEY = 'remind.for' // same key as REMIND_FOR in reminders.ts (not imported: that file imports this one)

export const REMINDER_ACTIONS = [
  { id: 'taken', title: 'Taken' },
  { id: 'snooze', title: `Snooze ${SNOOZE_MIN} min` },
  { id: 'open', title: 'Open', foreground: true }
]

export async function registerReminderActions(): Promise<void> {
  try { await LocalNotifications.registerActionTypes({ types: [{ id: DOSE_ACTION_TYPE, actions: REMINDER_ACTIONS }] }) } catch { /* the reminder still rings, just without buttons */ }
}

export interface ReminderEvent {
  actionId?: string
  notification?: { id?: number; title?: string; body?: string; extra?: { kind?: string; at?: number } }
}
export type ReminderOutcome = 'logged' | 'nothing-due' | 'snoozed' | 'open' | 'ignored'

async function people(): Promise<string[]> {
  const self = await selfIdOrCached().catch(() => null)
  const v = (await db.kv.get(REMIND_FOR_KEY).catch(() => undefined))?.value
  const extra = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []
  return [...new Set([...(self ? [self] : []), ...extra])]
}

/** Log every dose due at `at` (minutes after midnight) that is not already logged today. Returns how many were logged. */
export async function markDue(at: number, now = new Date()): Promise<number> {
  const slot = toClock(at)
  const today = dayOf(now)
  const ids = await people()
  const meds = ids.length ? await ldb.medications.filter((m) => ids.includes(m.personId)).toArray() : []
  const done = await ldb.meds.filter((t) => dayOf(t.takenAt) === today && t.slot === slot).toArray()
  let n = 0
  for (const p of ids) {
    for (const m of remindable(meds, p, today)) {
      const times = Array.isArray((m.schedule as { times?: unknown })?.times) ? ((m.schedule as { times: string[] }).times) : Array.isArray(m.schedule) ? (m.schedule as string[]) : []
      if (!times.includes(slot)) continue
      if (done.some((t) => t.personId === p && !t.skipped && (m.serverId ? t.medicationId === m.serverId : t.name === m.name))) continue
      await logDose(m, slot, { at: now })
      n++
    }
  }
  return n
}

/** What a tap on a reminder button does. Anything that is not a dose reminder is ignored. */
export async function handleReminderAction(ev: ReminderEvent, now = new Date()): Promise<ReminderOutcome> {
  const n = ev?.notification
  if (n?.extra?.kind !== 'dose') return 'ignored'
  if (ev.actionId === 'taken') {
    const at = n.extra.at
    const logged = typeof at === 'number' ? await markDue(at, now) : 0
    try { if (n.id != null) await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: n.id, title: n.title ?? '', body: n.body ?? '' }] }) } catch { /* already gone */ }
    return logged > 0 ? 'logged' : 'nothing-due'
  }
  if (ev.actionId === 'snooze') {
    const when = new Date(now.getTime() + SNOOZE_MIN * 60_000)
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: 1_900_000_000 + ((n.id ?? 0) % 100_000_000), title: n.title ?? '', body: n.body ?? '', extra: n.extra,
          actionTypeId: DOSE_ACTION_TYPE, schedule: { at: when, allowWhileIdle: true }
        }]
      })
    } catch { /* the next daily reminder still comes */ }
    return 'snoozed'
  }
  return 'open'
}
