import { db, enqueue } from '../../db'
import { supabase } from '../auth/client'
import { isNativeAndroid } from '../safety/settingsOpener'
import { ALARM_SHELL, shellVersionNow, versionAtLeast } from './appInfo'
import { KEY_ALARM_HEALTH, KEY_PHONE_SENT, type AlarmHealth } from './keys'
import { BLANK_PROBE, probe, type ProbeResult } from './probe'

export const RESEND_MS = 12 * 3_600_000 // the family's "not opened for 48 h" sweep only needs a fresh last_open_at now and then (ML-06: bounded outbox)

const webVersion = (): string | null => { const v = String(import.meta.env.VITE_APP_VERSION ?? ''); return /^[0-9a-z.+-]{1,20}$/.test(v) ? v : null }

/** Queue this phone's `phone_health` row (one row per user, upserted). Unknown fields go out as null, never false or 0 (ML-05):
 *  web and shells below 2.3.0 send `alarms_ok` null. An unchanged phone queues at most one row every 12 hours. Returns true when a row was queued. Never throws. */
export async function reportPhoneHealth(opts: { now?: Date; result?: ProbeResult } = {}): Promise<boolean> {
  try {
    const now = opts.now ?? new Date()
    const userId = supabase ? (await supabase.auth.getSession()).data.session?.user.id : undefined
    if (!userId) return false // signed out or auth not configured: nobody to report for
    const native = isNativeAndroid()
    const r = opts.result ?? (native ? await probe() : BLANK_PROBE)
    const ver = native ? await shellVersionNow() : webVersion()
    const planning = native && versionAtLeast(ver, ALARM_SHELL)
    const health = planning ? (await db.kv.get(KEY_ALARM_HEALTH).catch(() => undefined))?.value as AlarmHealth | undefined : undefined
    const stable = {
      userId, platform: native ? 'android' : 'web', appVersion: ver,
      alarmsOk: planning ? r.alarms_ok : null, notifOk: r.notif_ok, exactOk: r.exact_ok, batteryOk: r.battery_ok, callOk: r.call_ok, oem: r.oem,
      alarmsSet: health?.set ?? null, alarmsRearmed: health?.rearmed ?? null
    }
    const sig = JSON.stringify(stable)
    const sent = (await db.kv.get(KEY_PHONE_SENT).catch(() => undefined))?.value as { sig?: string; at?: number } | undefined
    if (sent?.sig === sig && typeof sent.at === 'number' && now.getTime() - sent.at < RESEND_MS && now.getTime() >= sent.at) return false
    await enqueue('phone_health', 'upsert', { ...stable, lastOpenAt: now.toISOString(), alarmsCheckedAt: health?.at ?? null, updatedAt: now.toISOString() })
    await db.kv.put({ key: KEY_PHONE_SENT, value: { sig, at: now.getTime() } })
    return true
  } catch { return false }
}
