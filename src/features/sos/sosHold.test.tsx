import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { autoTextAllowed, loadActive, saveActive, SOS_ACTIVE_KEY, takeFresh } from './active'
import Call911 from './Call911'
import { HOLD_MS } from './hold'
import SosButton from './SosButton'
import SosHold from './SosHold'

const h = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('./call', () => ({ callFirstContact: (...a: unknown[]) => h.call(...a) }))

beforeEach(async () => { await db.kv.clear(); h.call.mockClear(); takeFresh() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('SosButton', () => {
  it('a finished hold starts the SOS once (the screen takes it) and tells the parent; the label promises the call and the text', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    render(<SosButton onSend={send} />)
    const btn = screen.getByRole('button', { name: /^SOS\./ })
    expect(btn.getAttribute('aria-label')).toMatch(/Hold to call and text your family/)
    fireEvent.pointerDown(btn)
    act(() => { vi.advanceTimersByTime(HOLD_MS) })
    expect(send).toHaveBeenCalledTimes(1)
    const f = takeFresh()
    expect(f?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Date.now() - Date.parse(f!.at)).toBeLessThan(1000)
    expect(takeFresh()).toBeNull() // taken exactly once
  })
  it('an early release starts nothing', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    render(<SosButton onSend={send} />)
    const btn = screen.getByRole('button', { name: /^SOS\./ })
    fireEvent.pointerDown(btn)
    act(() => { vi.advanceTimersByTime(HOLD_MS - 500) })
    fireEvent.pointerUp(btn)
    act(() => { vi.advanceTimersByTime(HOLD_MS) })
    expect(send).not.toHaveBeenCalled()
    expect(takeFresh()).toBeNull()
  })
  it('shows the full red hold screen with a 3 2 1 count while held (safety-sos-hold)', () => {
    vi.useFakeTimers()
    render(<SosButton onSend={() => undefined} />)
    expect(screen.queryByTestId('sos-hold-screen')).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button', { name: /^SOS\./ }))
    expect(screen.getByTestId('sos-hold-screen').textContent).toMatch(/3seconds.*Keep holding.*Nothing is saved or dialled until the ring is full/)
    act(() => { vi.advanceTimersByTime(2100) })
    expect(screen.getByTestId('sos-hold-screen').textContent).toMatch(/^1second/)
  })
  it('a still-open SOS shows an Open it button that goes back to the screen without starting a new SOS', async () => {
    await saveActive({ id: 'e1', step: 'calling', at: new Date().toISOString(), contactIndex: 0 })
    const send = vi.fn()
    render(<SosButton onSend={send} />)
    fireEvent.click(await screen.findByRole('button', { name: /still open/ }))
    expect(send).toHaveBeenCalledTimes(1)
    expect(takeFresh()).toBeNull()
  })
})

describe('SosHold (Simple mode)', () => {
  it('holding shows the countdown line; the full 3 seconds starts the SOS, an early release does not', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    render(<SosHold onSend={send} />)
    const btn = screen.getByRole('button', { name: 'Hold to call and text your family' })
    expect(btn.textContent).toBe('Hold for help')
    fireEvent.pointerDown(btn)
    expect(btn.textContent).toBe('Holding... 3 seconds to go')
    act(() => { vi.advanceTimersByTime(2200) })
    expect(btn.textContent).toBe('Holding... 1 second to go')
    expect(screen.getByText('Let go to cancel. Nothing is sent yet.')).toBeTruthy()
    fireEvent.pointerUp(btn)
    act(() => { vi.advanceTimersByTime(HOLD_MS) })
    expect(send).not.toHaveBeenCalled()
    fireEvent.pointerDown(btn)
    act(() => { vi.advanceTimersByTime(HOLD_MS) })
    expect(send).toHaveBeenCalledTimes(1)
    expect(takeFresh()).not.toBeNull()
  })
  it('keyboard users confirm instead of holding', () => {
    const send = vi.fn()
    render(<SosHold onSend={send} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Hold to call and text your family' }), { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, send SOS' }))
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('Call911', () => {
  it('always asks for the emergency dial screen, never an auto-dial', () => {
    render(<Call911 />)
    fireEvent.click(screen.getByRole('button', { name: /Call 911/ }))
    expect(h.call).toHaveBeenCalledWith([], { emergency: true })
  })
})

describe('sos.active', () => {
  it('the composer opens by itself only under 10 minutes and only when not cancelled (hand-computed edges)', () => {
    const now = Date.parse('2026-10-26T10:00:00.000Z')
    const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString()
    expect(autoTextAllowed(at(0), false, now)).toBe(true)
    expect(autoTextAllowed(at(9.99), false, now)).toBe(true)
    expect(autoTextAllowed(at(10), false, now)).toBe(false)
    expect(autoTextAllowed(at(11), false, now)).toBe(false)
    expect(autoTextAllowed(at(1), true, now)).toBe(false)
  })
  it('loadActive ignores a malformed or 12-hour-old entry and returns a good one', async () => {
    const now = Date.now()
    await db.kv.put({ key: SOS_ACTIVE_KEY, value: { id: 1, step: 'x' } })
    expect(await loadActive(now)).toBeNull()
    const good = { id: 'e1', step: 'status' as const, at: new Date(now - 3_600_000).toISOString(), contactIndex: 1 as const }
    await saveActive(good)
    expect(await loadActive(now)).toEqual(good)
    expect(await loadActive(now + 12 * 3_600_000)).toBeNull()
  })
})
