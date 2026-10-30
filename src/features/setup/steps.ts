import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { loadFamily } from '../auth/family'
import { enableAlerts } from '../notify/alerts'
import { sosDone } from '../sos/contacts'
import { batteryStatus, isNativeAndroid, nativeStatus, requestBatteryExemption } from '../safety/settingsOpener'
import { PW_KEY, detectPlatform, osKey, statusOf, type Rec } from '../safety/PhoneWarnings'
import { hdb } from '../records/store'
import { ldb } from '../log/store'
import { currentPersonId, getState } from '../sensors/health'
import type { Platform } from '../sensors/health'

export type { Platform }
export type StepId = 'photo' | 'about' | 'medicines' | 'notifications' | 'location' | 'health' | 'warnings' | 'sos' | 'sharing'
export type Probe = Record<StepId, boolean>
export const ORDER: StepId[] = ['photo', 'about', 'medicines', 'notifications', 'location', 'health', 'warnings', 'sos', 'sharing']
const ANDROID_ONLY = new Set<StepId>(['health'])

export const TITLES: Record<StepId, string> = {
  photo: 'Your photo',
  about: 'About me',
  medicines: 'Your medicines',
  notifications: 'Reminders and alerts',
  location: 'Where you are',
  health: 'Phone health data',
  warnings: "Your phone's warnings",
  sos: 'SOS text contacts',
  sharing: 'Sharing'
}

/** The single source for "what is left" (A-28): the wizard queue and the Today checklist both come from here. */
export const remaining = (p: Probe, platform: Platform): StepId[] =>
  ORDER.filter((s) => !p[s] && (platform === 'android' || !ANDROID_ONLY.has(s)))

export const ABOUT_FIELDS = ['bloodType', 'allergies', 'conditions'] as const
export type About = Partial<Record<(typeof ABOUT_FIELDS)[number], string>>
export { UNKNOWN } from './lists'

const get = async <T,>(key: string): Promise<T | undefined> => (await db.kv.get(key).catch(() => undefined))?.value as T | undefined
export const put = (key: string, value: unknown) => db.kv.put({ key, value })

export interface NotifyState { display: boolean; exact: boolean; battery: boolean }

/** Reads the three notification switches. Web has no alarm or battery switch, so those count as on. */
/** The plugin reports the exact-alarm switch itself (older Android always reports granted). */
export const exactOk = (status: string): boolean => status === 'granted'
/** Done when notifications, exact alarms and (on Android) the battery exemption are all on. Web reports battery as on. */
export const notifyDone = (n: NotifyState) => n.display && n.exact && n.battery

/** Re-runs `fn` when the app comes back to the front (web tab or Android app), e.g. after a Settings switch. Returns the cleanup. */
export function onResume(fn: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    // native: appStateChange only (visibilitychange fires too, which would run fn twice)
    let handle: Promise<{ remove(): Promise<void> }> | undefined
    try { handle = App.addListener('appStateChange', (s) => { if (s.isActive) fn() }) } catch { /* no app plugin */ }
    return () => { void handle?.then((h) => h.remove()).catch(() => undefined) }
  }
  const on = () => { if (document.visibilityState === 'visible') fn() }
  document.addEventListener('visibilitychange', on)
  return () => document.removeEventListener('visibilitychange', on)
}

/** The one "Turn on" tap: notification permission, then the exact-alarm switch if it is still off. Never rejects. */
export async function turnOnReminders(): Promise<void> {
  try {
    if (!isNativeAndroid()) { await enableAlerts(); return }
    const p = await LocalNotifications.requestPermissions()
    if (p.display === 'granted' && !exactOk((await LocalNotifications.checkExactNotificationSetting()).exact_alarm)) await LocalNotifications.changeExactNotificationSetting()
    if (!(await batteryStatus()).ignoring) await requestBatteryExemption()
  } catch { /* the step shows what is still off */ }
}

export async function notifyState(): Promise<NotifyState> {
  try {
    if (isNativeAndroid()) {
      const s = await nativeStatus() // Android's own answer, one call
      if (s) return { display: s.notificationsEnabled, exact: s.canScheduleExactAlarms, battery: s.ignoringBatteryOptimizations }
    }
    const display = (await LocalNotifications.checkPermissions()).display === 'granted'
    if (!isNativeAndroid()) return { display, exact: true, battery: true }
    const exact = exactOk((await LocalNotifications.checkExactNotificationSetting()).exact_alarm)
    return { display, exact, battery: (await batteryStatus()).ignoring }
  } catch {
    return { display: false, exact: false, battery: false }
  }
}

const hasMedicines = async () => {
  const id = await currentPersonId().catch(() => null)
  if (id && (await ldb.medications.where('personId').equals(id).filter((m) => m.medStatus !== 'stopped').count().catch(() => 0)) > 0) return true
  return !!id && (await hdb.consults.where('personId').equals(id).toArray().catch(() => [])).some((c) => c.medicines?.length)
}

export async function probe(): Promise<Probe> {
  const about = await get<About>('profile.about')
  const sos = await get<unknown[]>('sos.contacts')
  const pw = await get<Rec>(PW_KEY)
  const n = await notifyState()
  const ua = navigator.userAgent
  return {
    photo: !!(await get<string>('profile.photo')) || !!(await get<string>('profile.photoPath')),
    about: !!about && ABOUT_FIELDS.every((f) => !!about[f]),
    medicines: (await get<boolean>('setup.medicines')) === true || ((await get<string[]>('profile.medicines'))?.length ?? 0) > 0 || (await hasMedicines()),
    notifications: notifyDone(n),
    location: (await get<boolean>('loc.asked')) === true || !!(await get('loc.home')),
    health: (await getState()).enabled.length > 0,
    warnings: (await get<boolean>('setup.warnings')) === true || statusOf(pw ?? null, detectPlatform(ua), Date.now(), osKey(ua)).chip === 'All on',
    sos: sosDone(sos, loadFamily()),
    sharing: (await get<boolean>('setup.sharing')) === true
  }
}

export const currentPlatform = (): Platform => {
  const p = Capacitor.getPlatform()
  return p === 'android' || p === 'ios' ? p : 'web'
}

/** The test reminder carries no health value (B-7). */
export const scheduleTest = () =>
  LocalNotifications.schedule({
    notifications: [{ id: 9001, title: 'Bantay test', body: 'Reminders work on this phone.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }]
  })

/** S16 C-9/L0 stub: the setup steps still to do, shown as a row on Today (NoticeStack). L8 fills the body (settings fallback). */
export function useSetupLeft(): { left: string[] } {
  return { left: [] }
}
