import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useSyncExternalStore } from 'react'
import { db } from '../../db'
import { loadActive } from '../sos/active'
import { dayKey } from '../family/events'
import { checkDue, parseLatest, type Latest } from './check'
import { getJob, hasVerifiedFile, onCellular, runJob } from './job'
import { AppUpdater } from './plugin'
import { checkForUpdate } from './useUpdate'

/** S32: Android updates itself. Native only. On start and on resume (at most every 6 h, kv update.autoAt) read latest.json; a newer versionCode is downloaded (Wi-Fi only unless the person changed it),
 *  SHA-256 checked and installed by the existing job (job.ts + AppUpdaterPlugin). When Android wants a tap, or Install unknown apps is still off, ONE local notification a day opens the update sheet.
 *  kv: update.auto (default on), update.autoAt (ms of the last check), update.notifiedOn (phone-local day of the last notice). */
export const AUTO_KEY = 'update.auto'
export const AUTO_AT_KEY = 'update.autoAt'
export const NOTIFIED_KEY = 'update.notifiedOn'
export const NOTICE_ID = 1_810_000_000 // free base: below the BP 1.82e9, battery 1.83e9, rain 1.84e9, tasks 1.85e9..1.89e9 and snooze 1.9e9 ranges, above the dose reminders (<1.7e9+31000)
export const NOTICE_TEXT = { title: 'Bantay update ready', body: 'Tap to install' }

export interface AutoInput {
  native: boolean
  enabled: boolean
  /** ms of the last automatic check; null = never. */
  lastCheck: number | null
  now: number
  /** The running shell's versionCode. */
  versionCode: number
  latest: Latest | null
  wifiOnly: boolean
  onWifi: boolean
  /** An SOS is running (sos.active). */
  callActive: boolean
  canInstall: boolean
  /** A verified APK of latest.versionCode is already on the phone. */
  haveFile?: boolean
}
export type AutoDecision =
  | { kind: 'skip'; reason: 'web' | 'off' | 'busy' | 'throttled' | 'no-latest' | 'bad-latest' | 'same' | 'downgrade' | 'mobile-data' }
  | { kind: 'download' | 'install' | 'notify-tap' }

/** Everything that can be decided before the network is touched. null = go ahead and look. */
export function autoGate(i: Pick<AutoInput, 'native' | 'enabled' | 'callActive' | 'lastCheck' | 'now'>): Extract<AutoDecision, { kind: 'skip' }> | null {
  if (!i.native) return { kind: 'skip', reason: 'web' }
  if (!i.enabled) return { kind: 'skip', reason: 'off' }
  if (i.callActive) return { kind: 'skip', reason: 'busy' }
  if (!checkDue(i.lastCheck, i.now)) return { kind: 'skip', reason: 'throttled' } // 6 h; a clock set back counts as due
  return null
}

export function decideAuto(i: AutoInput): AutoDecision {
  const g = autoGate(i)
  if (g) return g
  if (!i.latest) return { kind: 'skip', reason: 'no-latest' }
  const l = parseLatest(i.latest) // also the GitHub release URL allow-list and the SHA-256 shape
  if (!l) return { kind: 'skip', reason: 'bad-latest' }
  if (l.versionCode === i.versionCode) return { kind: 'skip', reason: 'same' }
  if (l.versionCode < i.versionCode) return { kind: 'skip', reason: 'downgrade' }
  if (!i.canInstall) return { kind: 'notify-tap' } // Install unknown apps is off: Android needs the person first
  if (i.haveFile) return { kind: 'install' } // needs no data
  if (i.wifiOnly && !i.onWifi) return { kind: 'skip', reason: 'mobile-data' }
  return { kind: 'download' }
}

/** The phone's own day, not UTC (a notice at 00:30 in Manila is a new day). */
export const mayNotify = (notifiedOn: unknown, now: number) => notifiedOn !== dayKey(new Date(now))

const kvGet = async <T,>(k: string) => (await db.kv.get(k).catch(() => undefined))?.value as T | undefined
const kvPut = (key: string, value: unknown) => db.kv.put({ key, value }).catch(() => undefined)

// the sheet the notice opens; App mounts <AutoUpdater/> which shows it
let wantSheet = false
const subs = new Set<() => void>()
export const requestSheet = (v: boolean) => { wantSheet = v; subs.forEach((f) => f()) }
export const useSheetRequest = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => wantSheet)

/** One notice a day. Never rejects. */
export async function noticeOnce(now = Date.now()): Promise<boolean> {
  try {
    if (!mayNotify(await kvGet(NOTIFIED_KEY), now)) return false
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return false
    await LocalNotifications.schedule({ notifications: [{ id: NOTICE_ID, ...NOTICE_TEXT, extra: { kind: 'update' } }] })
    await kvPut(NOTIFIED_KEY, dayKey(new Date(now)))
    return true
  } catch { return false }
}

let running = false
/** Called on start and on resume. Never rejects. Returns what it did, for tests. */
export async function runAuto(now = Date.now()): Promise<AutoDecision> {
  const native = Capacitor.isNativePlatform()
  const base = { native, enabled: (await kvGet<boolean>(AUTO_KEY)) !== false, lastCheck: (await kvGet<number>(AUTO_AT_KEY)) ?? null, now, callActive: false }
  if (running || ['downloading', 'pending'].includes(String(getJob().phase))) return { kind: 'skip', reason: 'busy' } // the person's own update is in flight
  const early = autoGate(base)
  if (early) return early
  running = true
  try {
    base.callActive = (await loadActive(now).catch(() => null)) != null
    const gate = autoGate(base)
    if (gate) return gate
    const shell = await AppUpdater.info().catch(() => null)
    if (!shell || shell.versionCode === 0) return { kind: 'skip', reason: 'web' }
    const s = await checkForUpdate(true)
    if (s.failed) return { kind: 'skip', reason: 'no-latest' } // offline: try again at the next start, no 6 h wait
    const wifiOnly = (await kvGet<boolean>('update.wifiOnly')) !== false
    const d = decideAuto({ ...base, versionCode: shell.versionCode, latest: s.latest, wifiOnly, onWifi: !onCellular(), canInstall: shell.canInstall, haveFile: !!s.latest && hasVerifiedFile(s.latest.versionCode) })
    // mobile data is waiting for Wi-Fi, and no latest.json is an unfinished check: neither uses up the 6 h
    if (!(d.kind === 'skip' && (d.reason === 'mobile-data' || d.reason === 'no-latest'))) await kvPut(AUTO_AT_KEY, now)
    if (d.kind === 'notify-tap') await noticeOnce(now)
    else if ((d.kind === 'download' || d.kind === 'install') && s.latest) {
      // silent: if Android needs a tap, the box is NOT opened from here; only the once-a-day notice is posted, and the box opens when the person taps the notice or the update sheet
      const r = await runJob(s.latest, AppUpdater, true)
      if (r === 'needs_tap' || getJob().phase === 'pending') await noticeOnce(now)
    }
    return d
  } catch { return { kind: 'skip', reason: 'no-latest' } } finally { running = false }
}

/** Wire start, resume and the notice tap. Returns the undo. */
export function startAuto(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined
  void runAuto()
  const resume = Promise.resolve(App.addListener('resume', () => { void runAuto() })).catch(() => undefined)
  const tap = Promise.resolve(LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    if ((a?.notification?.extra as { kind?: string } | undefined)?.kind === 'update') requestSheet(true)
  })).catch(() => undefined)
  return () => { void resume.then((h) => h?.remove()).catch(() => undefined); void tap.then((h) => h?.remove()).catch(() => undefined) }
}
