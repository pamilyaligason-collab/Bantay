import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ android: true }))
const fx = vi.hoisted(() => ({ applyFix: vi.fn(), openAutostart: vi.fn(), probe: vi.fn(), sync: vi.fn(), report: vi.fn(), test: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }))
vi.mock('../safety/settingsOpener', () => ({ isNativeAndroid: () => m.android }))
vi.mock('./fix', async (orig) => ({ ...(await orig<typeof import('./fix')>()), applyFix: fx.applyFix, openAutostart: fx.openAutostart }))
vi.mock('./probe', async (orig) => ({ ...(await orig<typeof import('./probe')>()), probe: fx.probe, scheduleTestAlarm: fx.test }))
vi.mock('../health/reminders', () => ({ syncDoseReminders: fx.sync }))
vi.mock('./report', () => ({ reportPhoneHealth: fx.report }))

import { db } from '../../db'
import { AlarmFixedToast, TOAST_TEXT } from './AlarmFixedToast'
import { AlarmHealthRow, healthLine } from './AlarmHealthRow'
import { KEY_ALARM_HEALTH, KEY_PHONE_CHECK, KEY_PHONE_LATER, KEY_TOAST_SEEN } from './keys'
import { PhoneCheckCard } from './PhoneCheckCard'

const XIAOMI = { notif_ok: true, exact_ok: true, battery_ok: false, alarms_ok: true, call_ok: true, oem: 'xiaomi' }
const HEALTH = { at: '2026-10-20T00:40:00.000Z', set: 7, rearmed: 7, ok: true, days: 7, recovered: true }

beforeEach(async () => { m.android = true; vi.clearAllMocks(); fx.applyFix.mockResolvedValue('prompted'); fx.probe.mockResolvedValue(XIAOMI); fx.sync.mockResolvedValue('unchanged'); fx.test.mockResolvedValue('scheduled'); await db.kv.clear() })
afterEach(cleanup)

describe('PhoneCheckCard (start-done-fix)', () => {
  it('shows the Xiaomi battery saver fix with three plain steps and the autostart button', () => {
    render(<PhoneCheckCard result={XIAOMI} />)
    expect(screen.getByText('One thing to fix: battery saver')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((x) => x.textContent)).toEqual(['Tap Fix it now', 'Battery saver, then No restrictions', 'Autostart: turn on'])
    expect(screen.getByRole('button', { name: 'Open autostart settings' })).toBeTruthy()
  })
  it('renders nothing when the check found no problem (unknown is not a problem)', () => {
    const { container } = render(<PhoneCheckCard result={{ notif_ok: null, exact_ok: null, battery_ok: null, alarms_ok: null, call_ok: null, oem: null }} />)
    expect(container.innerHTML).toBe('')
  })
  it('Fix it now applies the fix for the top problem, then checks again', async () => {
    render(<PhoneCheckCard result={XIAOMI} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix it now (1 minute)' }))
    await waitFor(() => expect(fx.applyFix).toHaveBeenCalledWith('battery'))
    await waitFor(() => expect(fx.probe).toHaveBeenCalled())
  })
  it('when nothing could be opened it says to follow the steps', async () => {
    fx.applyFix.mockResolvedValue('failed')
    render(<PhoneCheckCard result={XIAOMI} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix it now (1 minute)' }))
    expect(await screen.findByText('We could not open Settings on this phone. Follow the steps above.')).toBeTruthy()
  })
  it('Remind me later is remembered locally so a small card stays on Today', async () => {
    const later = vi.fn()
    render(<PhoneCheckCard result={XIAOMI} onLater={later} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }))
    await waitFor(async () => expect((await db.kv.get(KEY_PHONE_LATER))?.value).toMatchObject({ at: expect.any(String) }))
    expect(later).toHaveBeenCalled()
  })
  it('once the check passes it tells the caller it is fixed', async () => {
    fx.probe.mockResolvedValue({ ...XIAOMI, battery_ok: true })
    const fixed = vi.fn()
    render(<PhoneCheckCard result={XIAOMI} onFixed={fixed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix it now (1 minute)' }))
    await waitFor(() => expect(fixed).toHaveBeenCalled())
  })
})

describe('AlarmFixedToast (today-alarmfix)', () => {
  it('says so once when alarms were set again after a failed plan, and nothing on a normal re-arm', async () => {
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: { ...HEALTH, recovered: undefined } })
    const { container } = render(<AlarmFixedToast />)
    await new Promise((r) => setTimeout(r, 60))
    expect(container.innerHTML).toBe('')
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: HEALTH })
    expect((await screen.findByRole('status')).textContent).toBe(TOAST_TEXT)
    expect((await db.kv.get(KEY_TOAST_SEEN))?.value).toBe(HEALTH.at)
    cleanup()
    render(<AlarmFixedToast />) // the same self-check is not announced again
    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('shows nothing in the browser app', async () => {
    m.android = false
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: HEALTH })
    const { container } = render(<AlarmFixedToast />)
    await new Promise((r) => setTimeout(r, 60))
    expect(container.innerHTML).toBe('')
  })
  it('after "Remind me later" a small card stays until the problem is fixed, and opens the fix card', async () => {
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: 'x', ...XIAOMI } })
    await db.kv.put({ key: KEY_PHONE_LATER, value: { at: 'x' } })
    render(<AlarmFixedToast />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fix it' }))
    expect(await screen.findByText('One thing to fix: battery saver')).toBeTruthy()
  })
  it('no small card when the person never chose "later", or the problem is gone', async () => {
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: 'x', ...XIAOMI } })
    const a = render(<AlarmFixedToast />)
    await new Promise((r) => setTimeout(r, 60))
    expect(a.container.innerHTML).toBe('')
    a.unmount()
    await db.kv.put({ key: KEY_PHONE_LATER, value: { at: 'x' } })
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: 'x', ...XIAOMI, battery_ok: true } })
    const b = render(<AlarmFixedToast />)
    await new Promise((r) => setTimeout(r, 60))
    expect(b.container.innerHTML).toBe('')
  })
  it('a missing call permission alone is not an alarm problem: no small card', async () => {
    await db.kv.put({ key: KEY_PHONE_LATER, value: { at: 'x' } })
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: 'x', ...XIAOMI, battery_ok: true, call_ok: false } })
    const { container } = render(<AlarmFixedToast />)
    await new Promise((r) => setTimeout(r, 60))
    expect(container.innerHTML).toBe('')
  })
})

describe('AlarmHealthRow (Me)', () => {
  it('healthLine reads like the mockup', () => {
    expect(healthLine(undefined)).toBe('Not checked yet')
    expect(healthLine(HEALTH)).toMatch(/^Alarms checked .*, 7 set for the next 7 days$/)
    expect(healthLine({ ...HEALTH, ok: false })).toContain('could not set them')
  })
  it('is not shown in the browser app', async () => {
    m.android = false
    const { container } = render(<AlarmHealthRow />)
    expect(container.innerHTML).toBe('')
  })
  it('Check now re-plans, probes and reports', async () => {
    await db.kv.put({ key: KEY_ALARM_HEALTH, value: HEALTH })
    render(<AlarmHealthRow />)
    fireEvent.click(await screen.findByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(fx.report).toHaveBeenCalledWith({ result: XIAOMI }))
    expect(fx.sync).toHaveBeenCalled()
  })
  it('tells the person when Android took back the phone permission, with the specified words, and Allow opens the fix', async () => {
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: 'x', ...XIAOMI, battery_ok: true, call_ok: false } })
    render(<AlarmHealthRow />)
    expect(await screen.findByText('Hold for help can no longer call for you')).toBeTruthy()
    expect(screen.getByText('Tap to allow')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(fx.applyFix).toHaveBeenCalledWith('call')
  })
  it('a problem turns Check now into Fix', async () => {
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: 'x', ...XIAOMI } })
    render(<AlarmHealthRow />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fix' }))
    expect(await screen.findByText('One thing to fix: battery saver')).toBeTruthy()
  })
})
