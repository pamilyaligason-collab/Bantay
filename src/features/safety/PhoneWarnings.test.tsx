import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as opener from './settingsOpener'

const plugin = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@capacitor/core', async (orig) => ({ ...(await orig<object>()), registerPlugin: () => plugin }))
import { db } from '../../db'
import { NOT_A_SIREN } from './alerts'
import PhoneWarnings, { detectPlatform, osKey, PW_KEY, statusOf, type Rec } from './PhoneWarnings'

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1'
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'
const NOW = Date.parse('2026-10-17T00:00:00Z')
const day = (n: number) => new Date(NOW - n * 86400000).toISOString()
const rec = (over: Partial<Rec> = {}): Rec => ({
  items: { 'android-eq': { state: 'on', at: day(1) }, 'android-wea': { state: 'on', at: day(1) } },
  checkedAt: day(1), os: 'android 14', ...over
})

describe('platform', () => {
  it('detects android, ios, other and OS major', () => {
    expect(detectPlatform(AND)).toBe('android')
    expect(detectPlatform(IOS)).toBe('ios')
    expect(detectPlatform(WIN)).toBe('other')
    expect(osKey(AND)).toBe('android 14')
    expect(osKey(IOS)).toBe('ios 17')
    expect(osKey(WIN)).toBeNull()
  })
})

describe('statusOf', () => {
  it('not checked, all on, partial', () => {
    expect(statusOf(null, 'android', NOW, 'android 14').chip).toBe('Not checked')
    expect(statusOf(rec(), 'android', NOW, 'android 14').chip).toBe('All on')
    expect(statusOf(rec({ items: { 'android-eq': { state: 'on', at: day(1) }, 'android-wea': { state: 'unsure', at: day(1) } } }), 'android', NOW, 'android 14').chip).toBe('1 to check')
  })
  it('expires after 90 days, not before', () => {
    expect(statusOf(rec({ checkedAt: day(89) }), 'android', NOW, 'android 14').stale).toBe(false)
    const s = statusOf(rec({ checkedAt: day(91) }), 'android', NOW, 'android 14')
    expect(s).toMatchObject({ stale: true, why: 'age', chip: '2 to check' })
  })
  it('expires when the OS major changes; unknown OS never expires', () => {
    expect(statusOf(rec(), 'android', NOW, 'android 15')).toMatchObject({ stale: true, why: 'os' })
    expect(statusOf(rec(), 'android', NOW, null).stale).toBe(false)
  })
  it('bad date counts as expired, never as fresh', () => {
    expect(statusOf(rec({ checkedAt: 'nope' }), 'android', NOW, null).stale).toBe(true)
  })
})

describe('PhoneWarnings', () => {
  it('shows only android steps, the not-a-siren line, and the test-message note', () => {
    render(<PhoneWarnings ua={AND} />)
    expect(screen.getByText('Android Earthquake Alerts')).toBeTruthy()
    expect(screen.getByText('Wireless emergency alerts')).toBeTruthy()
    expect(screen.queryByText('Government Alerts')).toBeNull()
    expect(screen.getByText(NOT_A_SIREN, { exact: false })).toBeTruthy()
    expect(screen.getByText(/Bantay cannot send one/)).toBeTruthy()
    expect(screen.getByText('Not checked')).toBeTruthy()
  })
  it('shows only iPhone steps on iOS', () => {
    render(<PhoneWarnings ua={IOS} />)
    expect(screen.getByText('Government Alerts')).toBeTruthy()
    expect(screen.queryByText('Android Earthquake Alerts')).toBeNull()
  })
  it('self-report is stored in kv and moves the chip', async () => {
    render(<PhoneWarnings ua={AND} />)
    const done = screen.getAllByRole('button', { name: 'Done on this phone' })
    fireEvent.click(done[0])
    await waitFor(() => expect(screen.getByText('1 to check')).toBeTruthy())
    fireEvent.click(screen.getAllByRole('button', { name: 'Not sure' })[1])
    fireEvent.click(screen.getAllByRole('button', { name: 'Done on this phone' })[1])
    await waitFor(() => expect(screen.getByText('All on')).toBeTruthy())
    const row = (await db.kv.get(PW_KEY))!.value as Rec
    expect(row.items['android-eq'].state).toBe('on')
    expect(row.items['android-wea'].state).toBe('on')
    expect(row.os).toBe('android 14')
    expect(Number.isFinite(Date.parse(row.checkedAt))).toBe(true)
  })
})

describe('Open Settings (native Android)', () => {
  it('web: no buttons', async () => {
    vi.spyOn(opener, 'isNativeAndroid').mockReturnValue(false)
    render(<PhoneWarnings ua={AND} now={NOW} />)
    await screen.findByText('Android Earthquake Alerts')
    expect(screen.queryByText('Open Settings')).toBeNull()
  })
  it('native: opens and shows what to look for', async () => {
    vi.spyOn(opener, 'isNativeAndroid').mockReturnValue(true)
    const open = plugin.open.mockResolvedValue({ opened: 'safety-center' })
    render(<PhoneWarnings ua={AND} now={NOW} />)
    fireEvent.click((await screen.findAllByText('Open Settings'))[0])
    await screen.findByText(/Look for Earthquake alerts and turn it on/)
    expect(open).toHaveBeenCalledWith({ target: 'earthquake' })
  })
  it('native: failure falls back to the written steps', async () => {
    vi.spyOn(opener, 'isNativeAndroid').mockReturnValue(true)
    plugin.open.mockRejectedValue(new Error('x'))
    render(<PhoneWarnings ua={AND} now={NOW} />)
    fireEvent.click((await screen.findAllByText('Open Settings'))[1])
    await screen.findByText(/could not open Settings.*steps above/)
  })
})
