import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { ldb, logDose } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import { supabase } from '../auth/client'
import { ALARM_CHANNEL } from '../phonecheck/keys'
import { dayOf, remindable, reminderId, toClock } from './meds'
import { BP_TYPE, handleBpAction } from '../nudge/bpReminder'

/** Lock-screen actions on a dose alarm: I took it / In 10 min / Skip today. "I took it" and "Skip today" log the doses due at that time without opening the app and cancel the rest of that slot's repeats;
 *  "In 10 min" keeps the +10 / +20 repeats already planned (they ring within 10 minutes) and, on the third reminder, rings once more in 10 minutes.
 *  The notification text is set in reminders.ts; this file only adds the buttons and what they do. Native only (the web has no lock screen). */
export const DOSE_ACTION_TYPE = 'DOSE_REMINDER'
export const REPEAT_MIN = 10
export const SNOOZE_MIN = REPEAT_MIN
export const SNOOZE_BASE = 1_900_000_000 // ids from here up are one-off "In 10 min" rings; planned alarms stay below 1.8e9
export const SNOOZE_TOP = 1_999_999_999 // exclusive; the test alarm sits at this id
const snoozeId = (n: { at?: number; day?: string }, id: number) => SNOOZE_BASE + (reminderId(typeof n.at === 'number' && n.day ? `${n.day}|${n.at}` : String(id), 'snooze') % 99_000_000) // per slot, so two slots never share a snooze id
const WRITABLE_KEY = 'carers.writable' // the cache written by useCanMark.loadWritable

export const REMINDER_ACTIONS = [
  { id: 'taken', title: 'I took it' },
  { id: 'snooze', title: `In ${SNOOZE_MIN} min` },
  { id: 'skip', title: 'Skip today' }
]

export async function registerReminderActions(): Promise<void> {
  try { await LocalNotifications.registerActionTypes({ types: [{ id: DOSE_ACTION_TYPE, actions: REMINDER_ACTIONS }, BP_TYPE] }) } catch { /* the reminder still rings, just without buttons */ }
}

export interface ReminderEvent {
  actionId?: string
  /** The text typed into a reply action (the BP reminder's BP_REPLY). */
  inputValue?: string
  notification?: { id?: number; title?: string; body?: string; extra?: { kind?: string; at?: number; slot?: string; people?: string[]; rep?: number; day?: string; sib?: number[] } }
}
export type ReminderOutcome = 'logged' | 'skipped' | 'nothing-due' | 'snoozed' | 'open' | 'ignored' | 'ask'

/** The people the Taken button may log for: this user and the people they are a writer carer of (the cached list the Health screens use; read-only carers' people are never in it). */
export async function markablePeople(selfId?: string | null): Promise<string[]> {
  const self = selfId !== undefined ? selfId : await selfIdOrCached().catch(() => null)
  const v = (await db.kv.get(WRITABLE_KEY).catch(() => undefined))?.value as { userId?: string; ids?: unknown } | undefined
  const uid = supabase ? await supabase.auth.getSession().then((r) => r.data.session?.user.id).catch(() => undefined) : undefined
  // the cache belongs to the user who filled it (useCanMark): after a user switch on a shared phone it is not this user's list
  const ids = v?.userId && v.userId === uid && Array.isArray(v.ids) ? v!.ids.filter((x): x is string => typeof x === 'string' && !!x) : []
  return [...new Set([...(self ? [self] : []), ...ids])]
}

/** Log the doses due at the slot for exactly `who` (those of them this user may write for), skipping any already logged today. Returns how many were logged. */
export async function markDue(at: number, who: string[], now = new Date(), skipped = false): Promise<number> {
  const slot = toClock(at)
  const today = dayOf(now)
  const allowed = new Set(await markablePeople())
  const ids = who.filter((p) => allowed.has(p))
  const meds = ids.length ? await ldb.medications.filter((m) => ids.includes(m.personId)).toArray() : []
  const done = await ldb.meds.filter((t) => dayOf(t.takenAt) === today && t.slot === slot).toArray()
  let n = 0
  for (const p of ids) {
    for (const m of remindable(meds, p, today)) {
      const times = Array.isArray((m.schedule as { times?: unknown })?.times) ? ((m.schedule as { times: string[] }).times) : Array.isArray(m.schedule) ? (m.schedule as string[]) : []
      if (!times.includes(slot)) continue
      if (done.some((t) => t.personId === p && (skipped || !t.skipped) && (m.serverId ? t.medicationId === m.serverId : t.name === m.name))) continue
      await logDose(m, slot, { at: now, ...(skipped ? { skipped: true } : {}) })
      n++
    }
  }
  return n
}

/** The rest of this slot's repeats (the ones after the one that rang) must not ring once the dose is answered. Never throws. */
async function cancelRest(extra: NonNullable<ReminderEvent['notification']>['extra'], ownId?: number): Promise<void> {
  const rep = typeof extra?.rep === 'number' ? extra.rep : -1
  const ids = (Array.isArray(extra?.sib) ? extra!.sib!.filter((x): x is number => typeof x === 'number') : []).filter((_, i) => i > rep)
  if (ownId != null && ownId >= SNOOZE_BASE) ids.push(ownId)
  if (!ids.length) return
  try { await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }) } catch { /* the next plan (on open) drops them */ }
}

/** What a tap on a reminder button does. Anything that is not a dose reminder is ignored. */
export async function handleReminderAction(ev: ReminderEvent, now = new Date()): Promise<ReminderOutcome> {
  const n = ev?.notification
  if (n?.extra?.kind === 'bp') return handleBpAction(ev) // the BP reminder's reply box (nudge/bpReminder.ts); the dose actions below are untouched
  if (n?.extra?.kind !== 'dose') return 'ignored'
  const clear = async () => { try { if (n.id != null) await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: n.id, title: n.title ?? '', body: n.body ?? '' }] }) } catch { /* already gone */ } }
  if (ev.actionId === 'taken' || ev.actionId === 'skip') {
    const skip = ev.actionId === 'skip'
    const at = n.extra.at
    const who = Array.isArray(n.extra.people) ? n.extra.people : [] // an older reminder without people logs nothing rather than guess
    const logged = typeof at === 'number' ? await markDue(at, who, now, skip) : 0
    if (logged > 0) await cancelRest(n.extra, n.id) // nothing was logged: the dose is still open, so the repeats keep ringing
    await clear()
    return logged > 0 ? (skip ? 'skipped' : 'logged') : 'nothing-due'
  }
  if (ev.actionId === 'snooze') {
    await clear()
    // repeats +10 / +20 are already planned: only the third reminder (or an old alarm without a repeat number) needs one more ring
    if (typeof n.extra.rep === 'number' && n.extra.rep < 2) return 'snoozed'
    const when = new Date(now.getTime() + SNOOZE_MIN * 60_000)
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: snoozeId(n.extra, n.id ?? 0), title: n.title ?? '', body: n.body ?? '', extra: n.extra, channelId: ALARM_CHANNEL,
          actionTypeId: DOSE_ACTION_TYPE, schedule: { at: when, allowWhileIdle: true }
        }]
      })
    } catch { /* the next daily alarm still comes */ }
    return 'snoozed'
  }
  return 'open'
}
