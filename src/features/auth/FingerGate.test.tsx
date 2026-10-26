import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ prompt: vi.fn(), mode: vi.fn(), enrol: vi.fn() }))
vi.mock('./biometric', () => ({ promptFingerprint: h.prompt, unlockMode: h.mode, openFingerprintEnrol: h.enrol }))
import { FingerOffer, LockScreen } from './FingerGate'

beforeEach(async () => { await db.kv.clear(); localStorage.clear(); h.prompt.mockReset(); h.mode.mockReset(); h.enrol.mockReset() })
afterEach(() => cleanup())

describe('LockScreen', () => {
  it('prompts at once and opens the app on success', async () => {
    h.prompt.mockResolvedValue(true)
    const onUnlocked = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={() => {}} onNotYou={() => {}} />)
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1))
    expect(h.prompt).toHaveBeenCalledTimes(1)
  })
  it('on a miss stays locked and offers PIN and Not you', async () => {
    h.prompt.mockResolvedValue(false)
    const onUnlocked = vi.fn(), onUsePin = vi.fn(), onNotYou = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={onUsePin} onNotYou={onNotYou} />)
    expect((await screen.findByRole('status')).textContent).toMatch(/did not work/)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not Mama?' }))
    expect(onUnlocked).not.toHaveBeenCalled()
    expect(onUsePin).toHaveBeenCalledTimes(1); expect(onNotYou).toHaveBeenCalledTimes(1)
  })
})

describe('LockScreen start-finger', () => {
  const hang = () => h.prompt.mockReturnValue(new Promise(() => {}))
  it('greets by name, shows Call 911 as the dial screen, and no PIN or private data', async () => {
    hang()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.getByRole('heading').textContent).toMatch(/^Magandang (umaga|hapon|gabi), Mama$/)
    expect(screen.getByText('Touch the fingerprint sensor')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call 911' }).getAttribute('href')).toBe('tel:911')
    expect(screen.getByRole('button', { name: 'Not Mama?' })).toBeTruthy()
  })
  it('shows the weather glance from the cached forecast, nothing when none is cached or it is old', async () => {
    hang()
    const fc = (at: number) => ({ fetchedAt: new Date(at).toISOString(), tz: 'Asia/Manila', utcOffset: 28800, current: { time: '', temp: 30.6, humidity: 70, feels: 36, code: 2, wind: 10, gust: 20, uv: 6 }, hourly: [], daily: [] })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(screen.queryByText(/partly cloudy/)).toBeNull()
    cleanup()
    await db.kv.put({ key: 'weather.forecast.6.11,125.17', value: fc(Date.now() - 20 * 3600_000) })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText(/partly cloudy/)).toBeNull()
    cleanup()
    await db.kv.put({ key: 'weather.forecast.6.11,125.17', value: fc(Date.now()) })
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={() => {}} onNotYou={() => {}} />)
    expect(await screen.findByText('31° partly cloudy')).toBeTruthy()
  })
  it('Medical ID opens without unlocking and shows allergies, conditions and who to call only', async () => {
    hang()
    await db.kv.put({ key: 'medid.cache', value: { personId: 'p1', at: 1, card: { name: 'Mama', age: 68, bloodType: 'O+', allergies: ['Penicillin'], conditions: ['Diabetes'], medicines: ['Losartan 50 mg'], calls: [{ name: 'Papa', phone: '0917 123 4567' }], missing: [] } } })
    const onUnlocked = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={onUnlocked} onUsePin={() => {}} onNotYou={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Medical ID' }))
    expect(await screen.findByText('Penicillin')).toBeTruthy()
    expect(screen.getByText('Diabetes')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Papa/ }).getAttribute('href')).toBe('tel:09171234567')
    expect(document.body.textContent).not.toMatch(/O\+|Losartan/)
    expect(onUnlocked).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Touch the fingerprint sensor')).toBeTruthy()
  })
})

describe('LockScreen negative button', () => {
  it("'use_pin' opens the PIN pad at once, no second tap", async () => {
    h.prompt.mockResolvedValue('use_pin')
    const onUsePin = vi.fn()
    render(<LockScreen name="Mama" onUnlocked={() => {}} onUsePin={onUsePin} onNotYou={() => {}} />)
    await waitFor(() => expect(onUsePin).toHaveBeenCalledTimes(1))
  })
})

describe('FingerOffer', () => {
  it('turns the fingerprint on after a successful prompt', async () => {
    h.mode.mockResolvedValue('fingerprint'); h.prompt.mockResolvedValue(true)
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on fingerprint' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(localStorage.getItem('bantay.passkey.p1')).toBe('1')
  })
  it('nothing enrolled: says so and opens Settings, or uses PIN each time', async () => {
    h.mode.mockResolvedValue('enrol-first')
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    expect(await screen.findByText('Set up a fingerprint in Settings first.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(h.enrol).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN each time' }))
    expect(onDone).toHaveBeenCalled()
    expect(localStorage.getItem('bantay.passkey.p1')).toBeNull()
  })
  it('no sensor: skips itself', async () => {
    h.mode.mockResolvedValue('pin')
    const onDone = vi.fn()
    render(<FingerOffer personId="p1" onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
})
