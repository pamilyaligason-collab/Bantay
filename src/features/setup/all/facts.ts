import { Capacitor } from '@capacitor/core'
import { db } from '../../../db'
import { FULL_LIBRARY_HOSTED, FULL_LIBRARY_MB } from '../../health/library/fullLibrary'
import { CONSENT_KEY } from '../../health/library/autoStart'
import { isNativeAndroid } from '../../safety/settingsOpener'
import { OFFLINE_PREFS_KEY } from '../../safety/autoMaps'
import { FLAGS } from '../../safety/flags'
import { capgoBridge } from '../../sensors/bridge'
import { getState } from '../../sensors/health'
import { deviceMaker } from '../../safety/settingsOpener'
import { hasAutostart } from '../../phonecheck/fix'
import { familyPlacesOn } from '../../family/flags'
import { placeNoticeKey, placeSharingOn } from '../../family/placeApi'
import { bgKeyKey } from '../../family/bgPlace'
import { notifyState } from '../steps'
import type { Facts } from './rows'

/** kv keys that keep a done state across visits (the phone cannot be asked about these). */
export const TEST_KEY = 'setup.test'
export const AUTOSTART_KEY = 'setup.autostart'
export const today = () => new Date().toISOString().slice(0, 10)

/** What this screen sets to "test sent" for the visit (the test reminder leaves nothing to read back). */
export const visit = { testSent: false }

const kv = async <T,>(key: string) => (await db.kv.get(key).catch(() => undefined))?.value as T | undefined

async function locationFact(): Promise<Facts['location']> {
  try {
    if (!('geolocation' in navigator)) return 'unsupported'
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Geolocation')) {
      const p = await import('@capacitor/geolocation').then((m) => m.Geolocation.checkPermissions())
      return p.location === 'granted' || p.coarseLocation === 'granted' ? 'granted' : p.location === 'denied' ? 'denied' : 'ask'
    }
    const st = await navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state, () => 'prompt')
    // Older shells: the WebView never retains the grant, so trust our own record of the answer there.
    if (st === 'prompt' && Capacitor.isNativePlatform() && (await kv<boolean>('loc.asked')) === true) return 'granted'
    return st === 'granted' ? 'granted' : st === 'denied' ? 'denied' : 'ask'
  } catch { return 'ask' }
}

/** Daily check-in: only offered when the phone has the runner, the Family places switch is on and this person has answered the place notice and has sharing on (the same gates bgPlace arms behind). Reads only, issues no key. */
async function bgFact(native: boolean): Promise<NonNullable<Facts['bg']>> {
  try {
    if (!native || !Capacitor.isPluginAvailable('BackgroundRunner') || !familyPlacesOn()) return 'none'
    const me = await import('../../sync/profile').then((m) => m.selfIdOrCached()).catch(() => null)
    if (!me || (await kv<boolean>(placeNoticeKey(me))) !== true || !(await placeSharingOn(me))) return 'none'
    return (await kv<unknown>(bgKeyKey(me))) ? 'on' : 'off'
  } catch { return 'none' }
}

async function healthFact(): Promise<Facts['health']> {
  try {
    if ((await getState()).enabled.length > 0) return 'on'
    return (await capgoBridge().isAvailable()) ? 'off' : 'unavailable'
  } catch { return 'unavailable' }
}

/** Everything the checklist needs from this phone except the update (that comes from useUpdate). Never rejects. */
export async function readFacts(): Promise<Omit<Facts, 'update'>> {
  const native = isNativeAndroid()
  const prefs = await kv<{ autoDownload?: boolean }>(OFFLINE_PREFS_KEY)
  const testDate = (await kv<string>(TEST_KEY)) ?? null
  const autostartDay = await kv<string>(AUTOSTART_KEY)
  const autostart: Facts['autostart'] = !native || !hasAutostart(await deviceMaker().catch(() => null)) ? 'none' : autostartDay ? 'done' : 'off'
  return {
    native,
    notifSupported: native || typeof Notification !== 'undefined',
    notif: await notifyState(),
    location: await locationFact(),
    health: native ? await healthFact() : 'unavailable',
    library: !FULL_LIBRARY_HOSTED ? 'none' : (await kv<string>(CONSENT_KEY)) === 'yes' ? 'on' : 'off',
    libraryMB: FULL_LIBRARY_MB,
    maps: !FLAGS.offlineMaps ? 'none' : prefs?.autoDownload === false ? 'off' : 'on',
    testSent: visit.testSent || !!testDate,
    testDate,
    familyPlaces: familyPlacesOn(),
    autostart,
    bg: await bgFact(native)
  }
}
