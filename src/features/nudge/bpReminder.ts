import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type ActionType } from '@capacitor/local-notifications'
import { db } from '../../db'
import { logReading } from '../log/store'
import { toMinutes } from '../health/meds'
import { selfIdOrCached } from '../sync/profile'
import { logBp } from '../today/actions'
import { parseReading, replyValid } from './replyParse'

/** The morning blood pressure reminder with a reply box: the lock screen shows "Reply with a reading", the person types 128/82 and it is saved without opening the app.
 *  kv `nudge.bpTimes` (local only, never synced): the 'HH:MM' times to remind at; empty or missing = no reminder (opt-in from Health > My progress).
 *  One-shot alarms for the next 7 days at ids 1.82e9 + day * 10 + n (above the dose alarms, below the snoozes at 1.9e9), re-planned on every app open, like the dose alarms.
 *  The text never carries a number or a name (B-7). A reply is parsed by replyParse; numbers outside the safe range, a top not above the bottom, or words that are not a reading are NEVER saved:
 *  the person gets a plain notification that opens Bantay instead. Native only. Not run on a device in this lane (ML-19): the tests use the plugin mock. */
export const BP_ACTION_TYPE = 'BP_REMINDER'
export const BP_REPLY = 'BP_REPLY'
export const BP_TIMES_KEY = 'nudge.bpTimes'
const BP_ARMED_KEY = 'nudge.bpArmed'
export const BP_ID_BASE = 1_820_000_000
export const BP_ID_TOP = BP_ID_BASE + 100
const ASK_ID = BP_ID_BASE + 90
const OPEN_ID = BP_ID_BASE + 91
const SAVED_ID = BP_ID_BASE + 92
export const BP_HORIZON_DAYS = 7
export const BP_MAX_TIMES = 3
export const DEFAULT_BP_TIME = '07:30'

export const BP_TYPE: ActionType = { id: BP_ACTION_TYPE, actions: [{ id: BP_REPLY, title: 'Reply with a reading', input: true, inputButtonTitle: 'Save', inputPlaceholder: '128/82' }] }

export const BP_TEXT = {
  title: 'Blood pressure check',
  body: 'Time to check your blood pressure. Reply with your two numbers, top then bottom.',
  ask: { title: 'Blood pressure', body: 'Over what? Reply with both numbers, top then bottom.' },
  open: { title: 'Please check in Bantay', body: 'We could not use that reply. Tap to open Bantay and add your reading there.' },
  saved: { title: 'Saved', body: 'Your reading is saved. Thank you.' }
}

export async function getBpTimes(): Promise<string[]> {
  const v = (await db.kv.get(BP_TIMES_KEY).catch(() => undefined))?.value
  return Array.isArray(v) ? [...new Set(v.filter((t): t is string => typeof t === 'string' && toMinutes(t) != null))].sort().slice(0, BP_MAX_TIMES) : []
}
export async function setBpTimes(times: string[]): Promise<void> {
  await db.kv.put({ key: BP_TIMES_KEY, value: [...new Set(times.filter((t) => toMinutes(t) != null))].sort().slice(0, BP_MAX_TIMES) })
  void syncBpReminders().catch(() => undefined)
}

/** The alarms to ring: each time, each of the next 7 days, still in the future. Pure. */
export function bpAlarms(times: string[], now: Date): { id: number; when: Date }[] {
  const out: { id: number; when: Date }[] = []
  for (let d = 0; d < BP_HORIZON_DAYS; d++) {
    times.slice(0, BP_MAX_TIMES).forEach((t, n) => {
      const m = toMinutes(t)
      if (m == null) return
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, Math.floor(m / 60), m % 60)
      if (when.getTime() > now.getTime()) out.push({ id: BP_ID_BASE + d * 10 + n, when })
    })
  }
  return out
}

const planIds = () => Array.from({ length: 90 }, (_, i) => ({ id: BP_ID_BASE + i })) // the 7 planned days x 3 times; the follow-up ids sit above
export type BpSync = 'web' | 'off' | 'no-permission' | 'scheduled' | 'failed'
let chain: Promise<unknown> = Promise.resolve()
/** Re-arm the reminder plan (cancel ours, schedule the wanted). With no times and nothing armed before it does nothing at all, so the dose alarms' own tests and behaviour never see it. */
export function syncBpReminders(now = new Date()): Promise<BpSync> {
  const next = chain.then(() => once(now))
  chain = next.catch(() => undefined)
  return next
}
async function once(now: Date): Promise<BpSync> {
  if (!Capacitor.isNativePlatform()) return 'web'
  try {
    const times = await getBpTimes()
    const armed = (await db.kv.get(BP_ARMED_KEY).catch(() => undefined))?.value === true
    if (!times.length && !armed) return 'off'
    if (!times.length) { await LocalNotifications.cancel({ notifications: planIds() }); await db.kv.put({ key: BP_ARMED_KEY, value: false }); return 'off' }
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return 'no-permission'
    await LocalNotifications.registerActionTypes({ types: [BP_TYPE] })
    await LocalNotifications.cancel({ notifications: planIds() })
    const alarms = bpAlarms(times, now)
    if (alarms.length) await LocalNotifications.schedule({ notifications: alarms.map((a) => ({ id: a.id, title: BP_TEXT.title, body: BP_TEXT.body, actionTypeId: BP_ACTION_TYPE, extra: { kind: 'bp' }, schedule: { at: a.when, allowWhileIdle: true } })) })
    await db.kv.put({ key: BP_ARMED_KEY, value: true })
    return 'scheduled'
  } catch { return 'failed' }
}

export interface BpEvent {
  actionId?: string
  inputValue?: string
  notification?: { id?: number; title?: string; body?: string; extra?: { kind?: string } }
}
export type BpOutcome = 'logged' | 'ask' | 'open' | 'ignored'

const say = async (id: number, m: { title: string; body: string }, ask = false) => {
  try {
    await LocalNotifications.schedule({ notifications: [{ id, title: m.title, body: m.body, ...(ask ? { actionTypeId: BP_ACTION_TYPE, extra: { kind: 'bp' } } : {}), schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true } }] })
  } catch { /* the reply is still handled; only the follow-up words are lost */ }
}

/** What a tap on the reminder, or a typed reply, does. Only a valid pair is saved (through logBp, the same writer as the Today quick log); the pulse, if given and sensible, is saved with it. */
export async function handleBpAction(ev: BpEvent): Promise<BpOutcome> {
  const n = ev?.notification
  if (n?.extra?.kind !== 'bp') return 'ignored'
  const clear = async () => { try { if (n.id != null) await LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: n.id, title: n.title ?? '', body: n.body ?? '' }] }) } catch { /* already gone */ } }
  if (ev.actionId !== BP_REPLY) return 'open' // a plain tap opens the app; nothing is saved
  await clear()
  const r = parseReading(ev.inputValue ?? '')
  if (!r) { await say(OPEN_ID, BP_TEXT.open); return 'open' }
  if ('ask' in r) { await say(ASK_ID, BP_TEXT.ask, true); return 'ask' }
  if (!replyValid(r)) { await say(OPEN_ID, BP_TEXT.open); return 'open' }
  const personId = await selfIdOrCached().catch(() => null)
  if (!personId) { await say(OPEN_ID, BP_TEXT.open); return 'open' }
  if ((await logBp(r.sys, r.dia)) !== 'ok') { await say(OPEN_ID, BP_TEXT.open); return 'open' }
  if (r.pulse != null) await logReading({ personId, takenAt: new Date().toISOString(), test: 'heart_rate', value: r.pulse, unit: 'bpm' }, { track: false }).catch(() => undefined)
  await say(SAVED_ID, BP_TEXT.saved)
  return 'logged'
}
