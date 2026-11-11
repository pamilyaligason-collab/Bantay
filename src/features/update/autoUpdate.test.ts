import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  native: true, cellular: false, phase: 'idle' as string, have: false,
  ln: { checkPermissions: vi.fn(), schedule: vi.fn(), addListener: vi.fn() },
  state: { latest: null as unknown, failed: false },
  info: { versionCode: 2008000, versionName: '2.8.0', canInstall: true, silentInstall: true } as { versionCode: number; versionName: string; canInstall: boolean; silentInstall?: boolean },
  runJob: vi.fn(), install: vi.fn(), sos: null as unknown
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native }, registerPlugin: () => ({}) }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: h.ln }))
vi.mock('./plugin', () => ({ AppUpdater: { info: () => Promise.resolve(h.info), install: h.install } }))
vi.mock('./useUpdate', () => ({ checkForUpdate: () => Promise.resolve(h.state) }))
vi.mock('./job', () => ({ getJob: () => ({ phase: h.phase }), onCellular: () => h.cellular, hasVerifiedFile: () => h.have, runJob: h.runJob }))
vi.mock('../sos/active', () => ({ loadActive: () => Promise.resolve(h.sos) }))

import { db } from '../../db'
import { AUTO_AT_KEY, AUTO_KEY, NEEDS_TAP_KEY, NOTIFIED_KEY, NOTICE_ID, autoGate, decideAuto, mayNotify, runAuto, type AutoInput } from './autoUpdate'
import { dayKey } from '../family/events'
import { TASK_ID_BASE, TASK_ID_SPAN } from '../family/taskReminders'
import { ID_SPAN, REMINDER_ID_BASE } from '../health/reminders'
import { BP_ID_BASE, BP_ID_TOP } from '../nudge/bpReminder'
import { BAT_ID } from '../today/batteryReminder'
import { RAIN_ID } from '../weather/rainRemind'
import { SNOOZE_BASE } from '../health/reminderActions'

const APK = 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.9.0/bantay-2.9.0.apk'
const L = { versionCode: 2009000, versionName: '2.9.0', url: APK, sha256: 'a'.repeat(64), size: 15779070, minShell: 2000000, notes: 'n' }
const HOUR = 3600_000
const NOW = new Date(2026, 10, 11, 12, 0).getTime()
const base: AutoInput = { native: true, enabled: true, lastCheck: null, now: NOW, versionCode: 2008000, latest: L, wifiOnly: true, onWifi: true, callActive: false, canInstall: true, silentInstall: true }

describe('decideAuto', () => {
  it('newer on Wi-Fi downloads', () => expect(decideAuto(base)).toEqual({ kind: 'download' }))
  it('a verified file on hand installs, even on mobile data', () => expect(decideAuto({ ...base, haveFile: true, onWifi: false })).toEqual({ kind: 'install' }))
  it('Install unknown apps off: notify-tap', () => expect(decideAuto({ ...base, canInstall: false })).toEqual({ kind: 'notify-tap' }))
  it('an old shell (no silentInstall flag) gets notify-tap, never download or install', () => {
    expect(decideAuto({ ...base, silentInstall: undefined })).toEqual({ kind: 'notify-tap' })
    expect(decideAuto({ ...base, silentInstall: false, haveFile: true })).toEqual({ kind: 'notify-tap' })
  })
  it('web build skips', () => expect(decideAuto({ ...base, native: false })).toEqual({ kind: 'skip', reason: 'web' }))
  it('setting off skips', () => expect(decideAuto({ ...base, enabled: false })).toEqual({ kind: 'skip', reason: 'off' }))
  it('SOS active skips', () => expect(decideAuto({ ...base, callActive: true })).toEqual({ kind: 'skip', reason: 'busy' }))
  it('throttle: 5h59 skips, 6h01 goes, never checked goes', () => {
    expect(decideAuto({ ...base, lastCheck: NOW - (6 * HOUR - 60_000) })).toEqual({ kind: 'skip', reason: 'throttled' })
    expect(decideAuto({ ...base, lastCheck: NOW - (6 * HOUR + 60_000) }).kind).toBe('download')
    expect(autoGate({ ...base, lastCheck: null })).toBeNull()
  })
  it('wifiOnly on mobile data waits; wifiOnly off downloads on mobile data', () => {
    expect(decideAuto({ ...base, onWifi: false })).toEqual({ kind: 'skip', reason: 'mobile-data' })
    expect(decideAuto({ ...base, onWifi: false, wifiOnly: false }).kind).toBe('download')
  })
  it('downgrade and same version skip', () => {
    expect(decideAuto({ ...base, versionCode: 2010000 })).toEqual({ kind: 'skip', reason: 'downgrade' })
    expect(decideAuto({ ...base, versionCode: 2009000 })).toEqual({ kind: 'skip', reason: 'same' })
  })
  it('a URL outside the GitHub release allow-list is refused', () => {
    expect(decideAuto({ ...base, latest: { ...L, url: 'https://evil.example/bantay.apk' } })).toEqual({ kind: 'skip', reason: 'bad-latest' })
    expect(decideAuto({ ...base, latest: { ...L, url: 'https://github.com/someone/else/releases/download/v1/a.apk' } })).toEqual({ kind: 'skip', reason: 'bad-latest' })
  })
  it('no latest.json skips', () => expect(decideAuto({ ...base, latest: null })).toEqual({ kind: 'skip', reason: 'no-latest' }))
})

describe('one notice a day (phone-local day)', () => {
  it('23:59 and 00:01 are different days; same day is blocked', () => {
    const late = new Date(2026, 10, 11, 23, 59).getTime(), early = new Date(2026, 10, 12, 0, 1).getTime()
    expect(dayKey(new Date(late))).toBe('2026-11-11')
    expect(dayKey(new Date(early))).toBe('2026-11-12')
    expect(mayNotify('2026-11-11', late)).toBe(false)
    expect(mayNotify('2026-11-11', early)).toBe(true)
    expect(mayNotify(undefined, late)).toBe(true)
  })
})

describe('NOTICE_ID', () => {
  it('sits in no other notification id range', () => {
    expect(NOTICE_ID < BP_ID_BASE && NOTICE_ID >= 100_000 + ID_SPAN).toBe(true) // idFor() hands doses ids in [100000, 100000 + ID_SPAN)
    expect(NOTICE_ID >= REMINDER_ID_BASE && NOTICE_ID < REMINDER_ID_BASE + 100).toBe(false) // legacy dose range
    expect([BAT_ID, RAIN_ID, SNOOZE_BASE, 1_999_999_999].includes(NOTICE_ID)).toBe(false)
    expect(NOTICE_ID >= BP_ID_BASE && NOTICE_ID <= BP_ID_TOP).toBe(false)
    expect(NOTICE_ID >= TASK_ID_BASE && NOTICE_ID < TASK_ID_BASE + TASK_ID_SPAN).toBe(false)
  })
})

describe('runAuto', () => {
  beforeEach(async () => {
    await db.kv.clear(); vi.clearAllMocks()
    Object.assign(h, { native: true, cellular: false, phase: 'idle', have: false, sos: null })
    h.state = { latest: L, failed: false }
    h.info = { versionCode: 2008000, versionName: '2.8.0', canInstall: true, silentInstall: true }
    h.ln.checkPermissions.mockResolvedValue({ display: 'granted' })
    h.ln.schedule.mockResolvedValue(undefined)
    h.runJob.mockResolvedValue(undefined)
  })
  it('downloads through the existing job and stamps update.autoAt; no notice when it installs', async () => {
    const d = await runAuto(NOW)
    expect(d.kind).toBe('download')
    expect(h.runJob).toHaveBeenCalledWith(L, expect.anything(), true) // silent: never opens Android's box
    expect((await db.kv.get(AUTO_AT_KEY))?.value).toBe(NOW)
    expect(h.ln.schedule).not.toHaveBeenCalled()
  })
  it('second run inside 6 h does nothing', async () => {
    await runAuto(NOW)
    expect(await runAuto(NOW + 5 * HOUR)).toEqual({ kind: 'skip', reason: 'throttled' })
    expect(h.runJob).toHaveBeenCalledTimes(1)
  })
  it('setting off stops everything', async () => {
    await db.kv.put({ key: AUTO_KEY, value: false })
    expect(await runAuto(NOW)).toEqual({ kind: 'skip', reason: 'off' })
    expect(h.runJob).not.toHaveBeenCalled()
  })
  it('SOS active: nothing, and the throttle is not used up', async () => {
    h.sos = { id: 'x', step: 'calling', at: new Date(NOW).toISOString(), contactIndex: 0 }
    expect(await runAuto(NOW)).toEqual({ kind: 'skip', reason: 'busy' })
    expect(await db.kv.get(AUTO_AT_KEY)).toBeUndefined()
  })
  it('mobile data with Wi-Fi only waits and keeps the throttle free', async () => {
    h.cellular = true
    expect(await runAuto(NOW)).toEqual({ kind: 'skip', reason: 'mobile-data' })
    expect(await db.kv.get(AUTO_AT_KEY)).toBeUndefined()
  })
  it('pending user action: one notice a day, a new one the next day', async () => {
    h.runJob.mockImplementation(async () => { h.phase = 'pending' })
    await runAuto(NOW); h.phase = 'idle'
    await runAuto(NOW + 7 * HOUR) // 19:00 same day
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
    expect(h.ln.schedule.mock.calls[0]![0].notifications[0]).toMatchObject({ title: 'Bantay update ready', body: 'Tap to install', extra: { kind: 'update' } })
    expect((await db.kv.get(NOTIFIED_KEY))?.value).toBe('2026-11-11')
    h.phase = 'idle'
    await runAuto(new Date(2026, 10, 12, 0, 30).getTime() + 7 * HOUR)
    expect(h.ln.schedule).toHaveBeenCalledTimes(2)
  })
  it('Android wants a tap (needs_tap): only the notice, no install call', async () => {
    h.runJob.mockResolvedValue('needs_tap')
    await runAuto(NOW)
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
    expect(h.ln.schedule.mock.calls[0]![0].notifications[0].id).toBe(NOTICE_ID)
    expect(h.install).not.toHaveBeenCalled()
  })
  it('notice at 23:59, next check at 00:01 local posts a new one', async () => {
    h.runJob.mockResolvedValue('needs_tap')
    const late = new Date(2026, 10, 11, 23, 59).getTime()
    await runAuto(late)
    expect((await db.kv.get(NOTIFIED_KEY))?.value).toBe('2026-11-11')
    await db.kv.delete(AUTO_AT_KEY) // clear the 6 h throttle so only the day rule is under test
    await runAuto(late + 2 * 60_000)
    expect(h.ln.schedule).toHaveBeenCalledTimes(2)
    expect((await db.kv.get(NOTIFIED_KEY))?.value).toBe('2026-11-12')
  })
  it('an unfinished check (no latest, not failed) does not use up the 6 h', async () => {
    h.state = { latest: null, failed: false }
    expect(await runAuto(NOW)).toEqual({ kind: 'skip', reason: 'no-latest' })
    expect(await db.kv.get(AUTO_AT_KEY)).toBeUndefined()
  })
  it('Install unknown apps off: notice, no download', async () => {
    h.info = { ...h.info, canInstall: false }
    expect((await runAuto(NOW)).kind).toBe('notify-tap')
    expect(h.runJob).not.toHaveBeenCalled()
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
  })
  it('an old shell (info() without silentInstall) never downloads or installs: notice only', async () => {
    h.info = { versionCode: 2008000, versionName: '2.8.0', canInstall: true }
    expect((await runAuto(NOW)).kind).toBe('notify-tap')
    expect(h.runJob).not.toHaveBeenCalled()
    expect(h.install).not.toHaveBeenCalled()
    expect(h.ln.schedule).toHaveBeenCalledTimes(1)
  })
  it('needs_tap is remembered per versionCode: later runs go straight to the notice', async () => {
    h.runJob.mockResolvedValue('needs_tap')
    await runAuto(NOW)
    expect((await db.kv.get(NEEDS_TAP_KEY))?.value).toBe(2009000)
    await db.kv.delete(AUTO_AT_KEY)
    expect((await runAuto(NOW + 7 * HOUR)).kind).toBe('notify-tap')
    expect(h.runJob).toHaveBeenCalledTimes(1)
    h.state = { latest: { ...L, versionCode: 2010000, versionName: '2.10.0' }, failed: false } // a newer version tries silently again
    await db.kv.delete(AUTO_AT_KEY)
    expect((await runAuto(NOW + 8 * HOUR)).kind).toBe('download')
    expect(h.runJob).toHaveBeenCalledTimes(2)
  })
  it('notification permission denied: no notice, no stamp', async () => {
    h.info = { ...h.info, canInstall: false }
    h.ln.checkPermissions.mockResolvedValue({ display: 'denied' })
    await runAuto(NOW)
    expect(h.ln.schedule).not.toHaveBeenCalled()
    expect(await db.kv.get(NOTIFIED_KEY)).toBeUndefined()
  })
  it('web: nothing', async () => {
    h.native = false
    expect(await runAuto(NOW)).toEqual({ kind: 'skip', reason: 'web' })
  })
})
