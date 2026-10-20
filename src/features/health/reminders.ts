import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { liveQuery } from 'dexie'
import { db } from '../../db'
import { track } from '../admin/events'
import { ldb } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import { dayOf, remindable, parseSchedule, reminderId, toMinutes } from './meds'
import { clock, medSlots } from './model'

/** Daily local dose reminders for the active, timed medicines of the signed-in person AND the people in kv `remind.for` (person ids,
 *  default none). Native only (web: nothing). A medicine whose "Still taking it?" review is over 3 days old is left out (D5).
 *  Ids are deterministic (hash of the medicines due at that time + the time), at least 100000 and below 2^31, and probed apart so two
 *  never collide; the previous ones (including the old 31000..31099 range) are cancelled before the new ones are scheduled.
 *  Text carries no medicine name or health value (B-7): the lock screen only says it is medicine time. */
export const REMINDER_ID_BASE = 31000 // the old range; kept so legacy callers and cancel-on-upgrade still read well
export const MAX_REMINDERS = 100
const KEY_IDS = 'health.doseReminderIds'
const KEY_SIG = 'health.doseReminderSig'
export const REMIND_FOR = 'remind.for'

export type ReminderResult = 'web' | 'no-permission' | 'unchanged' | 'scheduled' | 'failed'
interface Planned { at: number; key: string }

const unique = <T,>(xs: T[]) => [...new Set(xs)]

async function remindPeople(selfId: string | null): Promise<string[]> {
  const v = (await db.kv.get(REMIND_FOR).catch(() => undefined))?.value
  const extra = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []
  return unique([...(selfId ? [selfId] : []), ...extra])
}

/** The times to remind at, each with the medicines due then (as a key, never shown). */
export async function plannedReminders(legacy: unknown, selfId: string | null, now = new Date()): Promise<Planned[]> {
  const people = await remindPeople(selfId)
  const meds = people.length ? await ldb.medications.filter((m) => people.includes(m.personId)).toArray() : []
  const byTime = new Map<number, string[]>()
  const add = (at: number | null, key: string) => { if (at != null) byTime.set(at, [...(byTime.get(at) ?? []), key]) }
  if (meds.length) {
    const today = dayOf(now)
    for (const p of people) for (const m of remindable(meds, p, today)) {
      const s = parseSchedule(m.schedule)
      if (s.needsTime) continue
      for (const t of s.times) add(toMinutes(t), m.serverId ?? m.clientId ?? String(m.id))
    }
  } else if (Array.isArray(legacy)) {
    // deprecated profile-text path: only until the medicines have been pulled into the medications table
    for (const s of medSlots(legacy.filter((m): m is string => typeof m === 'string'))) add(s.at, 'text')
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_REMINDERS).map(([at, keys]) => ({ at, key: keys.sort().join(',') }))
}

/** Collision-safe ids: the hash of (medicines due, time), moved up by one while it is taken. */
export function reminderIds(planned: Planned[]): number[] {
  const used = new Set<number>()
  return planned.map((p) => {
    let id = reminderId(p.key, String(p.at))
    while (used.has(id)) id = id + 1 >= 2_147_483_647 ? 100_000 : id + 1
    used.add(id)
    return id
  })
}

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
    })).catch(() => { tapBound = false })
  } catch { tapBound = false }
}

/** `medicines` is the deprecated profile text list, used only while this phone has no medications rows yet. */
export async function syncDoseReminders(medicines?: unknown, opts: { selfId?: string | null; now?: Date } = {}): Promise<ReminderResult> {
  if (!Capacitor.isNativePlatform()) return 'web'
  try {
    const selfId = opts.selfId !== undefined ? opts.selfId : await selfIdOrCached().catch(() => null)
    const planned = await plannedReminders(medicines, selfId, opts.now)
    const ids = reminderIds(planned)
    const sig = planned.map((p, i) => `${ids[i]}@${p.at}`).join(',')
    const [oldIds, oldSig] = await Promise.all([db.kv.get(KEY_IDS), db.kv.get(KEY_SIG)])
    const had = Array.isArray(oldIds?.value) ? (oldIds!.value as number[]) : []
    if (oldSig?.value === sig && had.length === planned.length) return 'unchanged'
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return 'no-permission'
    if (had.length) await LocalNotifications.cancel({ notifications: had.map((id) => ({ id })) })
    if (planned.length) {
      await LocalNotifications.schedule({
        notifications: planned.map((p, i) => ({
          id: ids[i]!,
          title: 'Medicine time',
          body: `It is ${clock(p.at)}. Open Bantay to see what is due.`,
          extra: { kind: 'dose' },
          schedule: { on: { hour: Math.floor(p.at / 60), minute: p.at % 60 }, allowWhileIdle: true }
        }))
      })
      bindTap()
    }
    await db.kv.put({ key: KEY_IDS, value: ids })
    await db.kv.put({ key: KEY_SIG, value: sig })
    return 'scheduled'
  } catch {
    return 'failed' // the screen still works; the next change tries again
  }
}

/** Keep reminders in step with the medications table and the `remind.for` setting. Returns a stop function. Native only. */
export function watchDoseReminders(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined
  let t: ReturnType<typeof setTimeout> | undefined
  const sub = liveQuery(async () => [await ldb.medications.toArray(), (await db.kv.get(REMIND_FOR))?.value]).subscribe({
    next: () => { clearTimeout(t); t = setTimeout(() => void syncDoseReminders(), 1500) },
    error: () => undefined
  })
  return () => { clearTimeout(t); sub.unsubscribe() }
}
