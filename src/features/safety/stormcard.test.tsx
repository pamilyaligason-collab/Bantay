import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ mood: vi.fn() }))
vi.mock('../today/actions', () => ({ logFeeling: log.mood, feelingToast: () => 'Your family has not seen this. Tap Unwell again when you are online, or call them.', FAIL_TEXT: { signedout: 'Sign in first, then try again.', failed: 'Could not save on this phone. Try again.' } }))
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from './alerts'
import { StormCard } from './StormCard'
import { alarmsHealth, callHealth, liveSignals, phoneAlertCount, signalOf, stormTitle } from './stormMode'

const NOW = Date.parse('2026-10-24T08:00:00+08:00')
const row = (over: Partial<Alert> = {}): Alert => ({
  id: 'pagasa-tcws-rosal-champi-dampas', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)',
  what: 'Winds of 62-88 kph may be expected within 24 hours.', where: 'Bohol (near Dampas, Tagbilaran City)', when: '2026-10-24 04:50 PH time', doNow: 'x',
  source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin', issuedAt: '2026-10-23T20:50:38.000Z', lat: 9.645705, lon: 123.877951, bulletin: 'b', ...over
})

beforeEach(async () => { await db.kv.clear(); log.mood.mockReset(); log.mood.mockResolvedValue('told') })
afterEach(() => cleanup())

describe('storm mode data', () => {
  it('only live wind signals count, highest first; a lifted signal (no level) and old rows do not', () => {
    const rows = [row({ id: 'a', level: 'Signal No. 1' }), row({ id: 'b', level: 'Signal No. 3' }), row({ id: 'c', level: null }), row({ id: 'd', issuedAt: '2026-10-22T00:00:00.000Z' }), row({ id: 'e', kind: 'rainfall', level: 'Moderate' })]
    expect(liveSignals(rows, NOW).map((a) => a.id)).toEqual(['b', 'a'])
    expect(signalOf({ level: 'Signal No. 5' })).toBe(5)
    expect(signalOf({ level: 'Moderate' })).toBeNull()
    expect(stormTitle(row())).toBe('Typhoon Rosal (CHAMPI)')
  })
  it('phone alerts count: false is a problem, null is unknown and never counted', () => {
    expect(phoneAlertCount(null)).toBe(0)
    expect(phoneAlertCount({ notif_ok: true, exact_ok: true, battery_ok: true, alarms_ok: true, call_ok: true })).toBe(0)
    expect(phoneAlertCount({ notif_ok: true, exact_ok: false, battery_ok: false, alarms_ok: null, call_ok: true })).toBe(1) // two alarm settings = one row
    expect(phoneAlertCount({ notif_ok: false, call_ok: false })).toBe(2)
    expect(phoneAlertCount({ notif_ok: null, exact_ok: null, battery_ok: null, alarms_ok: null, call_ok: null })).toBe(0)
    expect(alarmsHealth({ notif_ok: true, exact_ok: true, battery_ok: true })).toBe('unknown') // alarms_ok missing: not all known
    expect(callHealth({ call_ok: true })).toBe('ok')
  })
})

describe('StormCard', () => {
  it('renders nothing without a live signal', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [row({ kind: 'gdacs', level: 'Orange' })] })
    const { container } = render(<StormCard now={NOW} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(container.textContent).toBe('')
  })
  it('shows the signal, the storm, the credit and the Do now list', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [row({ id: 'lo', level: 'Signal No. 1' }), row()] })
    render(<StormCard now={NOW} />)
    expect(await screen.findByRole('heading', { name: 'Typhoon Rosal (CHAMPI)' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Wind signal number 2' }).textContent).toBe('2')
    expect(screen.getByText('PAGASA, CC BY 4.0')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See the source' }).getAttribute('href')).toContain('pagasa.dost.gov.ph')
    expect(screen.getByText('Charge phones and power banks')).toBeTruthy()
    expect(screen.getByText(/Go-bag: 0 of \d+ packed/)).toBeTruthy()
  })
  it('the faces are the mood log; copy says the family can see it in Bantay, never "told" or "notified"', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [row()] })
    render(<StormCard now={NOW} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Great' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved. Your family can see it in Bantay.'))
    expect(log.mood).toHaveBeenLastCalledWith('great')
    fireEvent.click(screen.getByRole('button', { name: 'Not great' }))
    await waitFor(() => expect(log.mood).toHaveBeenLastCalledWith('notgreat'))
    expect(document.body.textContent).not.toMatch(/will be (told|notified)|lock screen/i)
  })
  it('Unwell goes through logFeeling (which raises the family alert); an unsent alert and a failed save each say so', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [row()] })
    render(<StormCard now={NOW} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('hold SOS or call 911'))
    expect(log.mood).toHaveBeenLastCalledWith('unwell')
    log.mood.mockResolvedValue('untold')
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Tap Unwell again'))
    log.mood.mockResolvedValue('signedout')
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Sign in first, then try again.'))
  })
})
