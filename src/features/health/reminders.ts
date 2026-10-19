import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { clock, medSlots } from './model'

/** Daily local dose reminders for the medicines that have times. Native only (web: nothing).
 *  Ids 31000..31099 are ours; the old ones are cancelled before the new ones are scheduled.
 *  Text carries no medicine name or health value (B-7): the lock screen only says it is medicine time. */
export const REMINDER_ID_BASE = 31000
export const MAX_REMINDERS = 100
const KEY_IDS = 'health.doseReminderIds'
const KEY_SIG = 'health.doseReminderSig'

export type ReminderResult = 'web' | 'no-permission' | 'unchanged' | 'scheduled' | 'failed'

export async function syncDoseReminders(medicines: unknown): Promise<ReminderResult> {
  if (!Capacitor.isNativePlatform()) return 'web'
  try {
    const entries = Array.isArray(medicines) ? medicines.filter((m): m is string => typeof m === 'string') : []
    const times = [...new Set(medSlots(entries).flatMap((s) => (s.at == null ? [] : [s.at])))].sort((a, b) => a - b).slice(0, MAX_REMINDERS)
    const sig = times.join(',')
    const [oldIds, oldSig] = await Promise.all([db.kv.get(KEY_IDS), db.kv.get(KEY_SIG)])
    const had = Array.isArray(oldIds?.value) ? (oldIds!.value as number[]) : []
    if (oldSig?.value === sig && (had.length === times.length)) return 'unchanged'
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return 'no-permission'
    if (had.length) await LocalNotifications.cancel({ notifications: had.map((id) => ({ id })) })
    const ids = times.map((_, i) => REMINDER_ID_BASE + i)
    if (times.length) {
      await LocalNotifications.schedule({
        notifications: times.map((at, i) => ({
          id: ids[i]!,
          title: 'Medicine time',
          body: `It is ${clock(at)}. Open Bantay to see what is due.`,
          schedule: { on: { hour: Math.floor(at / 60), minute: at % 60 }, allowWhileIdle: true }
        }))
      })
    }
    await db.kv.put({ key: KEY_IDS, value: ids })
    await db.kv.put({ key: KEY_SIG, value: sig })
    return 'scheduled'
  } catch {
    return 'failed' // the screen still works; the next change tries again
  }
}
