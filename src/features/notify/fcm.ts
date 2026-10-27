import { Capacitor } from '@capacitor/core'
import { supabase } from '../auth/client'
import { db } from '../../db'
import { shellVersionNow } from '../phonecheck/appInfo'
import { pollAlerts } from './alertsLive'
import { TEMPLATES } from './templates'

// FCM push for the Android app (session 12, lane E, D-85). The server (dose-watch, broadcast) sends a template-only message to the tokens stored here.
// Nothing in this file may crash an old shell (no push plugin), a build without google-services.json, or the web: every native call is inside try/catch
// and the whole thing is a no-op off Android. The token is the phone's address, not a person's data; sign-out deletes it before the session ends (ML-07).
export const CHANNEL_ID = 'carer_alerts' // importance 5: rings and shows over other apps
export const QUIET_CHANNEL_ID = 'carer_quiet' // importance 2: tone-normal alerts the server sends between 22:00 and 06:00 Manila
export const KEY_PUSH_TOKEN = 'push.token' // kv: this phone's current FCM token (so sign-out can delete exactly it)
export const KEY_PUSH_PERM = 'push.perm' // kv: last notification permission answer: 'granted' | 'denied' | 'prompt'
export const KEY_PUSH_STATUS = 'push.status' // kv: 'ready' only after register() gave a token AND push_token_claim saved it in this install; 'failed' | 'noplugin' otherwise (the Me row reads it)

type PushPlugin = typeof import('@capacitor/push-notifications').PushNotifications
const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
const loadPlugin = async (): Promise<PushPlugin | null> => { try { return (await import('@capacitor/push-notifications')).PushNotifications } catch { return null } }
/** The shell has no push plugin (an APK older than 2.4.0 running the new web). */
const pluginMissing = () => { try { return !Capacitor.isPluginAvailable('PushNotifications') } catch { return false } }
const putKv = (key: string, value: unknown) => db.kv.put({ key, value }).catch(() => undefined)

/** Both channels, before register() (Android only creates a channel once; creating an existing one is a no-op). A failure is not fatal: Android then uses its default channel. */
export async function createChannels(P: PushPlugin): Promise<void> {
  const make = (c: Parameters<PushPlugin['createChannel']>[0]) => P.createChannel(c).catch(() => undefined)
  await make({ id: CHANNEL_ID, name: 'Family alerts', description: 'Missed medicines, SOS and other alerts from your family.', importance: 5, visibility: 0, vibration: true })
  await make({ id: QUIET_CHANNEL_ID, name: 'Quiet family updates', description: 'Gentle updates at night. No sound.', importance: 2, visibility: 0, vibration: false })
}

/** Ask for the notification permission when Android has not been asked yet (Android 13+ POST_NOTIFICATIONS). Records the answer; false when it is not granted. */
async function ensurePermission(P: PushPlugin): Promise<boolean> {
  try {
    let r = await P.checkPermissions()
    if (r.receive === 'prompt' || r.receive === 'prompt-with-rationale') r = await P.requestPermissions()
    await putKv(KEY_PUSH_PERM, r.receive)
    return r.receive === 'granted'
  } catch { return false }
}

/** Save the token for this signed-in user on the server (one phone, one owner: the server removes it from anyone else who left it here). The local copy is kept first so sign-out can find it. */
export async function claimToken(token: string): Promise<boolean> {
  await putKv(KEY_PUSH_TOKEN, token)
  let ok = false
  if (supabase) {
    try {
      const { error } = await supabase.rpc('push_token_claim', { p_token: token, p_app_version: (await shellVersionNow()) ?? undefined })
      ok = !error // offline or before 0040: the next registration event tries again
    } catch { /* ok stays false */ }
  }
  await putKv(KEY_PUSH_STATUS, ok ? 'ready' : 'failed')
  return ok
}

/** What a tap on a notification opens: the tab of the template its data.t names (carer missed-dose 'dose_watch' opens Health). Unknown opens Today. */
export function tabFor(t: unknown): string {
  if (t === 'dose_watch') return 'health'
  return typeof t === 'string' && Object.hasOwn(TEMPLATES, t) ? TEMPLATES[t as keyof typeof TEMPLATES].tab : 'today'
}

/** Register this phone for pushes and wire the listeners; returns the stop function. Resolves after register(). Never throws. */
async function startPush(isStopped: () => boolean, onStop: (fn: () => void) => void): Promise<void> {
  const P = await loadPlugin()
  if (!P || isStopped()) return
  if (pluginMissing()) { await putKv(KEY_PUSH_STATUS, 'noplugin'); return }
  try {
    await createChannels(P)
    if (isStopped()) return
    const handles = await Promise.all([
      P.addListener('registration', (t) => { void claimToken(t.value) }),
      P.addListener('registrationError', () => { void putKv(KEY_PUSH_STATUS, 'failed') }), // no google-services.json or Google Play services missing: alerts still reach the bell by polling
      P.addListener('pushNotificationReceived', () => { void pollAlerts() }), // in the foreground Android shows nothing itself: refresh the bell now
      P.addListener('pushNotificationActionPerformed', (a) => { try { location.hash = `#${tabFor(a.notification?.data?.t)}` } catch { /* no window */ } void pollAlerts() })
    ])
    onStop(() => handles.forEach((h) => void h.remove().catch(() => undefined)))
    if (isStopped()) return
    if (!(await ensurePermission(P))) return
    await P.register()
  } catch { await putKv(KEY_PUSH_STATUS, 'failed') /* no Firebase config: no push, the bell still polls */ }
}

let again: (() => void) | null = null
/** Me calls this when the person comes back from Settings: if alerts are now allowed, register now (no restart needed). */
export function retryPushRegistration(): void { again?.() }

/** Re-reads the permission without asking (Me row, app resume). */
export async function refreshPushPermission(): Promise<'granted' | 'denied' | 'prompt' | null> {
  if (!isAndroidApp()) return null
  const P = await loadPlugin()
  if (!P) return null
  if (pluginMissing()) { await putKv(KEY_PUSH_STATUS, 'noplugin'); return null }
  try {
    const r = (await P.checkPermissions()).receive
    const v = r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'prompt'
    await putKv(KEY_PUSH_PERM, v)
    if (v === 'granted') retryPushRegistration()
    return v
  } catch { return null }
}

/** Delete this phone's token on the server, then unregister it with Google so a sign-out never leaves the last person's alerts coming here (ML-07).
 *  Must run BEFORE supabase.auth.signOut (the delete needs the session). Never throws; offline, the token is removed when the next person signs in (push_token_claim). */
export async function forgetPushToken(): Promise<void> {
  try {
    const token = (await db.kv.get(KEY_PUSH_TOKEN))?.value
    if (typeof token === 'string' && supabase) await supabase.from('push_tokens').delete().eq('token', token)
  } catch { /* offline: see above */ }
  await db.kv.delete(KEY_PUSH_TOKEN).catch(() => undefined)
  await db.kv.delete(KEY_PUSH_STATUS).catch(() => undefined)
  if (!isAndroidApp()) return
  try { await (await loadPlugin())?.unregister() } catch { /* nothing to unregister */ }
}

export { PushPermissionRow } from './PushPermissionRow' // lane A mounts it in Me > Alerts

/** App.tsx hook (F1 mounts it beside watchAlertsForSession): register for whoever is signed in, stop on sign-out. No-op on the web and on old shells. */
export function watchPushForSession(): () => void {
  const sb = supabase
  if (!sb || !isAndroidApp()) return () => undefined
  let uid: string | null = null
  let run = 0 // bumped on every change of person, so a start for the last person cannot keep listeners
  let cleanup: (() => void) | null = null
  const stop = () => { run++; cleanup?.(); cleanup = null; again = null }
  const apply = (next: string | null) => {
    if (next === uid) return
    stop()
    if (uid !== null) void db.kv.delete(KEY_PUSH_STATUS).catch(() => undefined) // another person on this phone: their claim has not happened yet
    uid = next
    if (!next) return
    const mine = ++run
    const go = () => startPush(() => mine !== run, (fn) => { cleanup = fn })
    again = () => { cleanup?.(); cleanup = null; void go() }
    void go()
  }
  void sb.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null))
  const { data } = sb.auth.onAuthStateChange((_e, session) => apply(session?.user.id ?? null))
  return () => { data.subscription.unsubscribe(); stop(); uid = null }
}
