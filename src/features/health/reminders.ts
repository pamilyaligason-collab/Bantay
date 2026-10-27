import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema, type PendingLocalNotificationSchema } from '@capacitor/local-notifications'
import { liveQuery } from 'dexie'
import { db } from '../../db'
import { track } from '../admin/events'
import { ldb } from '../log/store'
import { ensureAlarmChannel } from '../phonecheck/channel'
import { ALARM_CHANNEL, KEY_ALARM_HEALTH, type AlarmHealth } from '../phonecheck/keys'
import { reportPhoneHealth } from '../phonecheck/report'
import { hdb } from '../records/store'
import { selfIdOrCached } from '../sync/profile'
import { MEDS_CURSOR } from './useMedicationRows'
import { dayOf, remindable, parseSchedule, reminderId, toClock, toMinutes } from './meds'
import { clock, medSlots } from './model'
import { DOSE_ACTION_TYPE, REPEAT_MIN, SNOOZE_BASE, SNOOZE_TOP, handleReminderAction, markablePeople, registerReminderActions } from './reminderActions'
import { LANG_KEY, loadLang, t, type Lang } from '../../lib/i18n'
import { syncBpReminders } from '../nudge/bpReminder'

/** Local dose alarms for the active, timed medicines of the signed-in person AND the people in kv `remind.for` (person ids, default none). Native only (web: nothing).
 *  A medicine whose "Still taking it?" review is over 3 days old is left out (D5).
 *
 *  How (Session 10, D-78): every dose slot gets ONE-SHOT alarms (`schedule.at`, `allowWhileIdle`) for the next 7 days, each ringing at +0, +10 and +20 minutes on the loud channel
 *  `alarms_v1`. The old repeating `on:` schedule is gone: a repeating alarm that Android drops is never re-armed, a one-shot is re-planned on every open.
 *  Self-heal: on every app open, return to the front and medication/dose change, every wanted alarm is scheduled again (getPending cannot see what Android dropped); the count is kept in kv `alarms.health`. Logging a dose cancels the rest of that slot's repeats. The alarms ring on the phone itself, no data needed.
 *  Ids are deterministic (hash of the medicines due, the time, the day and the repeat), at least 100000 and below 1.8e9 (snoozes live at 1.9e9 and up), probed apart so two never collide.
 *  Text carries no medicine name or health value (B-7). Copy rule: the alarm "rings loudly", never "even on silent"; "your family will see this in Bantay", never "will be told". */
export const REMINDER_ID_BASE = 31000 // the old range; kept so legacy callers and cancel-on-upgrade still read well
export const MAX_REMINDERS = 100
export const REPEATS = 3 // +0, +10, +20
export const HORIZON_DAYS = 7
export const PENDING_CAP = 450 // Android keeps at most 500 alarms per app on many phones; stay clear of it
export const CARER_AFTER_MIN = 30 // dose-watch's DOSE_WATCH_AFTER_MIN default: the family sees a missed dose this long after the slot
const ID_SPAN = 1_700_000_000
const KEY_IDS = 'health.doseReminderIds'
export const REMIND_FOR = 'remind.for'

export type ReminderResult = 'web' | 'no-permission' | 'unchanged' | 'scheduled' | 'failed'
interface Due { personId: string; medicationId?: string; name: string }
export interface Planned { at: number; key: string; /** People whose doses due at this time the Taken button may log: this user and writer-carer people only. */ people: string[]; /** Every dose due then (to see when all are answered). */ due: Due[] }
export interface Alarm { id: number; when: Date; at: number; rep: 0 | 1 | 2; day: string; sib: number[]; people: string[] }

const unique = <T,>(xs: T[]) => [...new Set(xs)]

async function remindPeople(selfId: string | null): Promise<string[]> {
  const v = (await db.kv.get(REMIND_FOR).catch(() => undefined))?.value
  const extra = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []
  const known = new Set(await hdb.people.toCollection().primaryKeys()) // an archived person is gone from here: no reminder for their medicines
  return unique([...(selfId ? [selfId] : []), ...extra.filter((x) => known.has(x))])
}

/** The times to remind at, each with the medicines due then (as a key, never shown). */
export async function plannedReminders(legacy: unknown, selfId: string | null, now = new Date()): Promise<Planned[]> {
  const people = await remindPeople(selfId)
  const meds = people.length ? await ldb.medications.filter((m) => people.includes(m.personId)).toArray() : []
  const byTime = new Map<number, string[]>()
  const whoByTime = new Map<number, Set<string>>()
  const dueByTime = new Map<number, Due[]>()
  const mayMark = new Set(await markablePeople(selfId))
  const add = (at: number | null, key: string, who?: string, due?: Due) => {
    if (at == null) return
    byTime.set(at, [...(byTime.get(at) ?? []), key])
    if (who && mayMark.has(who)) whoByTime.set(at, (whoByTime.get(at) ?? new Set()).add(who))
    if (due) dueByTime.set(at, [...(dueByTime.get(at) ?? []), due])
  }
  if (meds.length) {
    const today = dayOf(now)
    for (const p of people) for (const m of remindable(meds, p, today)) {
      const s = parseSchedule(m.schedule)
      if (s.needsTime) continue
      for (const t of s.times) add(toMinutes(t), m.serverId ?? m.clientId ?? String(m.id), p, { personId: p, name: m.name, ...(m.serverId ? { medicationId: m.serverId } : {}) })
    }
  } else if (Array.isArray(legacy) && !(await db.kv.get(MEDS_CURSOR).catch(() => undefined))?.value) {
    // deprecated profile-text path: only until the medications have been pulled once (an empty first read must never cancel what rings today)
    for (const s of medSlots(legacy.filter((m): m is string => typeof m === 'string'))) add(s.at, 'text')
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_REMINDERS).map(([at, keys]) => ({ at, key: keys.sort().join(','), people: [...(whoByTime.get(at) ?? [])].sort(), due: dueByTime.get(at) ?? [] }))
}

/** One collision-safe id: the hash of (medicines due, tag), moved up by one while it is taken. Always in [100000, 1.8e9). */
export function idFor(used: Set<number>, key: string, tag: string): number {
  let id = 100_000 + ((reminderId(key, tag) - 100_000) % ID_SPAN)
  while (used.has(id)) id = id + 1 >= 100_000 + ID_SPAN ? 100_000 : id + 1
  used.add(id)
  return id
}
/** Collision-safe ids, one per planned time. */
export function reminderIds(planned: Pick<Planned, 'at' | 'key'>[]): number[] {
  const used = new Set<number>()
  return planned.map((p) => idFor(used, p.key, String(p.at)))
}

/** How many days to plan so the pending alarms stay under the cap: 7, else 3, else 1. */
export function horizonDays(slots: number): number { return slots * REPEATS * HORIZON_DAYS <= PENDING_CAP ? HORIZON_DAYS : slots * REPEATS * 3 <= PENDING_CAP ? 3 : 1 }

/** Slots of today whose every due dose this user can log is already answered (taken or skipped): the rest of their repeats must not ring. Keys are `${day}|${at}`. */
export async function answeredSlots(planned: Planned[], now: Date): Promise<Set<string>> {
  const today = dayOf(now)
  const rows = await ldb.meds.filter((r) => dayOf(r.takenAt) === today).toArray()
  const out = new Set<string>()
  if (!rows.length) return out
  for (const p of planned) {
    const slot = toClock(p.at)
    const mine = p.people.length ? p.due.filter((d) => p.people.includes(d.personId)) : p.due // a person this user may not log for never keeps the slot open
    if (mine.length && mine.every((d) => rows.some((r) => r.slot === slot && r.personId === d.personId && (d.medicationId ? r.medicationId === d.medicationId : r.name === d.name)))) out.add(`${today}|${p.at}`)
  }
  return out
}

/** Every alarm still to ring: today's remaining repeats and the next days' three each. Ids of all three repeats are allocated even when one is already past, so ids never move. */
export function buildAlarms(planned: Planned[], now: Date, answered: Set<string> = new Set()): Alarm[] {
  const used = new Set<number>()
  const out: Alarm[] = []
  const days = horizonDays(planned.length)
  for (let d = 0; d < days; d++) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    const day = dayOf(base)
    for (const p of planned) {
      const sib = ([0, 1, 2] as const).map((rep) => idFor(used, p.key, `${p.at}|${day}|${rep}`))
      if (answered.has(`${day}|${p.at}`)) continue
      for (const rep of [0, 1, 2] as const) {
        const when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(p.at / 60), (p.at % 60) + rep * REPEAT_MIN)
        if (when.getTime() > now.getTime()) out.push({ id: sib[rep]!, when, at: p.at, rep, day, sib, people: p.people })
      }
    }
  }
  return out
}

const REPEAT_TEXT: Record<Lang, { t1: string; b1: string; t2: string; b2: string }> = {
  en: { t1: 'Medicine reminder', b1: 'Not logged yet. It was {time}. Tap I took it, or open Bantay.', t2: 'Third reminder', b2: 'Third reminder; your family will see this in Bantay at {late}.' },
  fil: { t1: 'Paalala sa gamot', b1: 'Hindi pa naitala. {time} ito. Pindutin ang I took it, o buksan ang Bantay.', t2: 'Ikatlong paalala', b2: 'Ikatlong paalala; makikita ito ng pamilya mo sa Bantay ng {late}.' } // review by a native speaker
}
/** Title and body of repeat `rep` for the slot at `at`. Never a medicine name or a value (B-7). */
export function alarmText(at: number, rep: 0 | 1 | 2, lang: Lang): { title: string; body: string } {
  const time = clock(at)
  if (rep === 0) return { title: t('med.title', {}, lang), body: t('med.body', { time }, lang) }
  const r = REPEAT_TEXT[lang]
  if (rep === 1) return { title: r.t1, body: r.b1.replace('{time}', time) }
  return { title: r.t2, body: r.b2.replace('{late}', clock((at + CARER_AFTER_MIN) % 1440)) }
}

const toNotification = (a: Alarm, lang: Lang): LocalNotificationSchema => ({
  id: a.id, ...alarmText(a.at, a.rep, lang), channelId: ALARM_CHANNEL,
  extra: { kind: 'dose', at: a.at, slot: toClock(a.at), people: a.people, rep: a.rep, day: a.day, sib: a.sib },
  actionTypeId: DOSE_ACTION_TYPE,
  schedule: { at: a.when, allowWhileIdle: true }
})

let tapBound = false
/** Test helper: forget that the tap listener was bound. */
export const resetReminderTapForTests = () => { tapBound = false }
/** A tap on a dose reminder is one usage event, nothing else (no name, no value). */
function bindTap() {
  if (tapBound) return
  tapBound = true
  try {
    void Promise.resolve(LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const kind = (a?.notification?.extra as { kind?: string } | undefined)?.kind
      if (kind === 'dose') void track('action', 'reminder_opened')
      void handleReminderAction(a as never).catch(() => undefined) // I took it / In 10 min / Skip today (reminderActions.ts); a plain tap does nothing more
    })).catch(() => { tapBound = false })
  } catch { tapBound = false }
}

const inLegacyRange = (id: number) => id >= REMINDER_ID_BASE && id < REMINDER_ID_BASE + 100
const isSnooze = (id: number) => id >= SNOOZE_BASE && id < SNOOZE_TOP

let chain: Promise<unknown> = Promise.resolve()
/** `medicines` is the deprecated profile text list, used only while this phone has no medications rows yet. Runs one at a time: open, resume and a data change can all ask at once. */
export function syncDoseReminders(medicines?: unknown, opts: { selfId?: string | null; now?: Date } = {}): Promise<ReminderResult> {
  const next = chain.then(() => syncOnce(medicines, opts))
  chain = next.catch(() => undefined)
  return next
}

/** Self-heal by re-arming, not by detection: `getPending()` reads the plugin's own saved list, not AlarmManager, so it cannot see an alarm Android dropped (a force-stop or a battery cleaner).
 *  So every call cancels the ids it armed before and schedules the whole wanted plan again (same ids, so it is idempotent). `rearmed` counts the slot-days that were armed before and are armed again. */
async function syncOnce(medicines: unknown, opts: { selfId?: string | null; now?: Date }): Promise<ReminderResult> {
  if (!Capacitor.isNativePlatform()) return 'web'
  bindTap() // idempotent: a cold start from a notification tap must still emit reminder_opened, whatever path below returns
  const now = opts.now ?? new Date()
  try {
    const selfId = opts.selfId !== undefined ? opts.selfId : await selfIdOrCached().catch(() => null)
    const planned = await plannedReminders(medicines, selfId, now)
    const lang = await loadLang() // the reminder text is in the saved language
    const prior = (await db.kv.get(KEY_ALARM_HEALTH).catch(() => undefined))?.value as AlarmHealth | undefined
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') { await saveHealth({ at: now.toISOString(), set: 0, rearmed: 0, ok: false, days: 0 }); return 'no-permission' }
    await ensureAlarmChannel()
    const answered = await answeredSlots(planned, now)
    const alarms = buildAlarms(planned, now, answered)
    const had = (await db.kv.get(KEY_IDS))?.value
    const hadSet = new Set(Array.isArray(had) ? (had as number[]) : [])
    let pending: PendingLocalNotificationSchema[] = []
    try { pending = (await LocalNotifications.getPending()).notifications ?? [] } catch { /* only used to find old repeating alarms and snoozes; the plan below does not depend on it */ }
    const snoozeDone = pending.filter((p) => isSnooze(p.id) && snoozeAnswered(p, answered)).map((p) => p.id) // an extra ring for a slot already answered
    const cancel = unique([...hadSet, ...pending.filter((p) => inLegacyRange(p.id)).map((p) => p.id), ...snoozeDone])
    if (cancel.length) await LocalNotifications.cancel({ notifications: cancel.map((id) => ({ id })) })
    if (alarms.length) {
      await registerReminderActions()
      await LocalNotifications.schedule({ notifications: alarms.map((a) => toNotification(a, lang)) })
    }
    await db.kv.put({ key: KEY_IDS, value: alarms.map((a) => a.id) })
    const groups = (xs: Alarm[]) => new Set(xs.map((a) => `${a.day}|${a.at}`)).size
    await saveHealth({ at: now.toISOString(), set: groups(alarms), rearmed: groups(alarms.filter((a) => hadSet.has(a.id))), ok: true, days: horizonDays(planned.length), ...(prior?.ok === false ? { recovered: true } : {}) })
    return cancel.length || alarms.length ? 'scheduled' : 'unchanged'
  } catch {
    await saveHealth({ at: now.toISOString(), set: 0, rearmed: 0, ok: false, days: 0 }).catch(() => undefined)
    return 'failed' // the screen still works; the next change tries again
  }
}

const snoozeAnswered = (p: PendingLocalNotificationSchema, answered: Set<string>): boolean => {
  const x = (p.extra ?? {}) as { at?: unknown; day?: unknown }
  return typeof x.at === 'number' && typeof x.day === 'string' && answered.has(`${x.day}|${x.at}`)
}

const saveHealth = (h: AlarmHealth) => db.kv.put({ key: KEY_ALARM_HEALTH, value: h })

/** Keep reminders in step with the medications table, the doses logged, the people on this phone and the `remind.for` setting; re-plan and re-arm on every return to the app. Returns a stop function.
 *  Web: no alarms, only the `phone_health` row (platform 'web') so the family's browser push still reaches this browser. */
export function watchDoseReminders(): () => void {
  if (!Capacitor.isNativePlatform()) {
    void reportPhoneHealth()
    const vis = () => { if (document.visibilityState === 'visible') void reportPhoneHealth() }
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async (legacy?: unknown) => { await syncDoseReminders(legacy !== undefined ? legacy : (await db.kv.get('profile.medicines'))?.value) }
  const sub = liveQuery(async () => [await ldb.medications.toArray(), await ldb.meds.count(), (await db.kv.get(REMIND_FOR))?.value, (await db.kv.get(MEDS_CURSOR))?.value, (await db.kv.get(LANG_KEY))?.value, (await db.kv.get('profile.medicines'))?.value, await hdb.people.toCollection().primaryKeys()]).subscribe({ // people too: an archived person dropped by sync must lose their reminders; the dose count: a logged dose cancels the rest of its repeats
    next: (v) => { clearTimeout(timer); timer = setTimeout(() => void run(v[5]), 1500) },
    error: () => undefined
  })
  let off: (() => void) | undefined
  let gone = false
  const front = () => { void run().then(() => reportPhoneHealth()); void syncBpReminders() } // on every open and return to the app: re-plan, re-arm what is missing, report; the BP reply reminder (nudge/bpReminder.ts) is re-armed too and does nothing until the person turns it on
  try {
    void Promise.resolve(App.addListener('appStateChange', (s) => { if (s.isActive) front() })).then((h) => { if (gone) void h.remove(); else off = () => void h.remove() }).catch(() => undefined)
  } catch { /* no app plugin: the live query still keeps the plan current */ }
  front()
  return () => { gone = true; clearTimeout(timer); sub.unsubscribe(); off?.() }
}
