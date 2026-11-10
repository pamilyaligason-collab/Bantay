import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { weatherPoint } from '../location/useLocation'
import { toWx } from '../today/weather'
import { miniSlots, MINI_SLOTS, type MiniSlot } from '../today/RainMini'
import { getForecast, hoursFrom } from './forecast'

/** "Remind me before rain" (X3). A switch on the Next 2 hours block (kv `wx.rainRemind`, local only). When it is on, at every app open or return
 *  the 2-hour estimate is read; if 0.1 mm is expected in the next 45 minutes or the chance in the next hour reaches the chosen threshold (40, 60 or 80%, default 60) and rain starts later than 20 minutes from now, ONE local notification is set for 15 minutes before it (30 minutes from now when only the chance is high), at most one per 3 hours, at the fixed id below
 *  (above the battery reminder at 1.83e9, below the snoozes at 1.9e9). No rain in the window, or the switch off: it is cancelled; rain already falling or starting within 20 minutes leaves an armed reminder as it is.
 *  A forecast that cannot be read leaves the plan as it was (unknown is not "dry"). The text names no person or place (B-7). Native only; the tests use the plugin mock (ML-19). */
export const RAIN_KEY = 'wx.rainRemind'
const ARMED_KEY = 'wx.rainRemindArmed'
export const RAIN_ID = 1_840_000_000
export const RAIN_TEXT = { title: 'Rain soon', body: 'Rain may start in about 15 minutes. This is an estimate from the hourly forecast. Open Bantay for the Weather.' }
export const RAIN_TEXT_CHANCE = { title: 'Rain soon', body: 'Rain is likely in the next hour. This is an estimate from the hourly forecast. Open Bantay for the Weather.' } // chance only, no wet slot: it rings 30 minutes from now
export const RAIN_LATER_MIN = 20 // rain this close is "now", no reminder
export const RAIN_LEAD_MIN = 15
const SLOT_MIN = 15
export const THRESH_KEY = 'wx.rainThreshold' // kv, local only: the rain chance (%) in the next hour that raises the alert
export const RAIN_CHOICES = [40, 60, 80] as const
export const RAIN_DEFAULT = 60
const LAST_KEY = 'wx.rainRemindLast' // ISO time of the last alert set; with RAIN_COOLDOWN_MS it keeps one rainy afternoon from ringing again and again
export const RAIN_COOLDOWN_MS = 3 * 3600_000
export const RAIN_MM = 0.1 // rain expected within RAIN_MM_MIN minutes
export const RAIN_MM_MIN = 45
// storm mode: a null mm is read as 0, so only the chance can raise the alert there (accepted)
const SOON_RING_MIN = 30 // chance-only alert (no wet slot): ring this long from now

/** When to ring, or null. Due when 0.1 mm or more is expected in the next 45 minutes, OR the rain chance in the next hour is at least `threshold`. Slot 0 starts now, slot i starts i x 15 minutes later.
 *  Rain in slot 0 or 1 (not later than 20 minutes away) rings nothing; the first wet slot rings 15 minutes ahead; a chance with no wet slot rings in 30 minutes. `prob` null = unknown, never counted. Pure. */
export function rainAlarm(slots: MiniSlot[] | null, now: Date, threshold: number = RAIN_DEFAULT, prob: number | null = null): Date | null {
  if (!slots) return null
  const mm = slots.slice(0, RAIN_MM_MIN / SLOT_MIN).reduce((a, s) => a + (s.mm ?? 0), 0)
  if (!(mm >= RAIN_MM - 1e-9) && !(prob != null && prob >= threshold)) return null
  const i = slots.findIndex((s) => s.wet)
  if (i >= 0 && i * SLOT_MIN <= RAIN_LATER_MIN) return null
  const lead = i < 0 ? SOON_RING_MIN : i * SLOT_MIN - RAIN_LEAD_MIN
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + lead * 60_000)
}

/** Still inside the 3 hours after the last alert time: no new alert. A pending (future) alert is not a cooldown, it may be re-planned. Pure. */
export const inCooldown = (lastIso: unknown, now: Date): boolean => { const t = typeof lastIso === 'string' ? Date.parse(lastIso) : NaN; return !Number.isNaN(t) && t <= now.getTime() && now.getTime() - t < RAIN_COOLDOWN_MS }

export type RainSync = 'web' | 'off' | 'unknown' | 'no-permission' | 'scheduled' | 'cancelled' | 'failed'
let chain: Promise<unknown> = Promise.resolve()
const kvGet = async (k: string) => (await db.kv.get(k).catch(() => undefined))?.value

/** A cancelled alert never rang, so it must not start the 3 hour cooldown: drop a stored time that is still in the future. */
const dropPending = async (now: Date) => { const t = Date.parse(String(await kvGet(LAST_KEY))); if (t > now.getTime()) await db.kv.delete(LAST_KEY) }

/** Apply the plan for these slots (null = the forecast could not be read). */
export function applyRainReminder(slots: MiniSlot[] | null, now = new Date(), prob: number | null = null): Promise<RainSync> {
  const next = chain.then(() => once(slots, now, prob))
  chain = next.catch(() => undefined)
  return next
}
async function once(slots: MiniSlot[] | null, now: Date, prob: number | null): Promise<RainSync> {
  if (!Capacitor.isNativePlatform()) return 'web'
  try {
    const on = (await kvGet(RAIN_KEY)) === true
    const armed = (await kvGet(ARMED_KEY)) === true
    if (!on) {
      if (!armed) return 'off'
      await LocalNotifications.cancel({ notifications: [{ id: RAIN_ID }] }); await db.kv.put({ key: ARMED_KEY, value: false }); await dropPending(now)
      return 'off'
    }
    if (!slots || slots.length < MINI_SLOTS) return 'unknown'
    const th = Number(await kvGet(THRESH_KEY)); const threshold = (RAIN_CHOICES as readonly number[]).includes(th) ? th : RAIN_DEFAULT
    if (inCooldown(await kvGet(LAST_KEY), now)) { if (armed) await db.kv.put({ key: ARMED_KEY, value: false }); return 'cancelled' } // the last alert rang less than 3 hours ago
    const at = rainAlarm(slots, now, threshold, prob)
    const text = slots.some((s) => s.wet) ? RAIN_TEXT : RAIN_TEXT_CHANCE
    // rain already falling or within 20 minutes leaves an armed reminder alone; only a window with no rain at all cancels it
    if (!at && slots.some((s) => s.wet)) return armed ? 'scheduled' : 'cancelled'
    if (armed || at) { await LocalNotifications.cancel({ notifications: [{ id: RAIN_ID }] }); await dropPending(now) }
    if (!at) { await db.kv.put({ key: ARMED_KEY, value: false }); return 'cancelled' }
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') { await db.kv.put({ key: ARMED_KEY, value: false }); return 'no-permission' }
    await LocalNotifications.schedule({ notifications: [{ id: RAIN_ID, title: text.title, body: text.body, extra: { kind: 'rain' }, schedule: { at, allowWhileIdle: true } }] })
    await db.kv.put({ key: ARMED_KEY, value: true }); await db.kv.put({ key: LAST_KEY, value: at.toISOString() })
    return 'scheduled'
  } catch { return 'failed' }
}

/** The app-open / resume entry (health/reminders.ts `front()` calls it next to the battery reminder): switch off or web does nothing, else read the cached-or-fresh forecast for where Weather looks and apply. */
export async function syncRainReminder(now = new Date()): Promise<RainSync> {
  if (!Capacitor.isNativePlatform()) return 'web'
  if ((await kvGet(RAIN_KEY)) !== true && (await kvGet(ARMED_KEY)) !== true) return 'off' // nothing to do and no forecast request for people who never turned it on
  let slots: MiniSlot[] | null = null
  let prob: number | null = null
  try { const r = await getForecast(await weatherPoint(now.getTime())); if (!r.fromCache) { slots = miniSlots(toWx(r.fc), now); const ps = hoursFrom(r.fc, 2, now.getTime()).flatMap((h) => (h.prob == null ? [] : [h.prob])); prob = ps.length ? Math.max(...ps) : null } } catch { /* unreadable, or only an older cache (network failed): not a reason to ring or to cancel */ }
  return applyRainReminder(slots, now, prob)
}
