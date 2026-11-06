import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { readBattery, type Battery } from './useBattery'

/** The 7 PM "charge your phone" reminder. On every app open and return (health/reminders.ts front) the level is read: under 30 %, not charging and before 19:00 today, one one-shot is set for 19:00 today; otherwise it is cancelled.
 *  The level is the one when Bantay was last open (a phone left alone all day is not re-read): the card says so. Id 1.83e9 sits above the BP reminder block (1.82e9 + 100) and below the snoozes (1.9e9). Native only; no name in the text (B-7). */
export const BAT_ID = 1_830_000_000
export const BAT_LOW = 0.3
export const BAT_HOUR = 19
export const BAT_TEXT = { title: 'Battery low', body: 'Your phone is under 30%. Charge it tonight so alarms and SOS work.' }

export const isLow = (b: Battery) => b.level < BAT_LOW && !b.charging
/** From 19:00 local: the moment a low, uncharged phone becomes a My day row. */
export const isEvening = (now: Date) => now.getHours() >= BAT_HOUR

/** When to ring today, or null for no reminder. Pure. */
export function batteryAlarm(b: Battery | null, now: Date): Date | null {
  if (!b || !isLow(b) || isEvening(now)) return null
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), BAT_HOUR)
}

export type BatSync = 'web' | 'scheduled' | 'cancelled' | 'no-permission' | 'failed'
let chain: Promise<unknown> = Promise.resolve()
export function syncBatteryReminder(now = new Date(), read: () => Promise<Battery | null> = readBattery): Promise<BatSync> {
  const next = chain.then(() => once(now, read))
  chain = next.catch(() => undefined)
  return next
}
async function once(now: Date, read: () => Promise<Battery | null>): Promise<BatSync> {
  if (!Capacitor.isNativePlatform()) return 'web'
  try {
    const at = batteryAlarm(await read(), now)
    await LocalNotifications.cancel({ notifications: [{ id: BAT_ID }] })
    if (!at) return 'cancelled'
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return 'no-permission'
    await LocalNotifications.schedule({ notifications: [{ id: BAT_ID, title: BAT_TEXT.title, body: BAT_TEXT.body, extra: { kind: 'battery' }, schedule: { at, allowWhileIdle: true } }] })
    return 'scheduled'
  } catch { return 'failed' }
}
