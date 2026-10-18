import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { loadFamily } from '../auth/family'
import { sosDone } from '../sos/contacts'
import { batteryStatus, isNativeAndroid } from '../safety/settingsOpener'
import { PW_KEY, detectPlatform, osKey, statusOf, type Rec } from '../safety/PhoneWarnings'
import { hdb } from '../records/store'
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
/** "Not sure" is stored as this, never as an empty value or 0 (B-5). */
export const UNKNOWN = 'UNKNOWN'

const get = async <T,>(key: string): Promise<T | undefined> => (await db.kv.get(key).catch(() => undefined))?.value as T | undefined
export const put = (key: string, value: unknown) => db.kv.put({ key, value })

export interface NotifyState { display: boolean; exact: boolean; battery: boolean }

/** Reads the three notification switches. Web has no alarm or battery switch, so those count as on. */
/** The plugin reports the exact-alarm switch itself (older Android always reports granted). */
export const exactOk = (status: string): boolean => status === 'granted'
/** The notifications step is satisfied when all three switches are on. */
export const notifyDone = (n: NotifyState) => n.display && n.exact && n.battery

export async function notifyState(): Promise<NotifyState> {
  try {
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
  return !!id && (await hdb.consults.where('personId').equals(id).toArray().catch(() => [])).some((c) => c.medicines?.length)
}

export async function probe(): Promise<Probe> {
  const about = await get<About>('profile.about')
  const sos = await get<unknown[]>('sos.contacts')
  const pw = await get<Rec>(PW_KEY)
  const n = await notifyState()
  const ua = navigator.userAgent
  return {
    photo: !!(await get<string>('profile.photo')),
    about: !!about && ABOUT_FIELDS.every((f) => !!about[f]),
    medicines: (await get<boolean>('setup.medicines')) === true || (await hasMedicines()),
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
