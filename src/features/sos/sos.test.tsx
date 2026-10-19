import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SosButton from './SosButton'
import { HOLD_MS } from './hold'
import { mapLink, smsNumber, smsUri, sosBody } from './sms'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('hold to send', () => {
  beforeEach(() => vi.useFakeTimers())
  const btn = () => screen.getByRole('button', { name: /^SOS\./ })

  it('does not fire before 3 seconds, fires once at 3 seconds', () => {
    const send = vi.fn()
    render(<SosButton onSend={send} />)
    fireEvent.pointerDown(btn())
    act(() => { vi.advanceTimersByTime(HOLD_MS - 1) })
    expect(send).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(send).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(HOLD_MS * 2) })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('an early release cancels and says to keep holding', () => {
    const send = vi.fn()
    render(<SosButton onSend={send} />)
    fireEvent.pointerDown(btn())
    act(() => { vi.advanceTimersByTime(1500) })
    fireEvent.pointerUp(btn())
    act(() => { vi.advanceTimersByTime(HOLD_MS) })
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toMatch(/keep holding/i)
  })

  it('keyboard and the visible alternative need a confirm step', () => {
    const send = vi.fn()
    render(<SosButton onSend={send} />)
    fireEvent.keyDown(btn(), { key: 'Enter' })
    expect(send).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, send SOS' }))
    expect(send).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cannot hold? Use a button instead' }))
    fireEvent.click(screen.getByRole('button', { name: 'No, go back' }))
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('SMS body and link', () => {
  const base = { name: 'Mama', lat: 9.65, lon: 123.88, time: '8:21 AM', gps: true }
  it('builds the agreed body with a maps link and the time', () => {
    expect(sosBody(base)).toBe('SOS from Mama. I need help. My location: https://maps.google.com/?q=9.65,123.88 (8:21 AM)')
    expect(mapLink(1, 2)).toBe('https://maps.google.com/?q=1,2')
  })
  it('says so when the place is only the home zone, and copes with no name', () => {
    const b = sosBody({ ...base, name: ' ', gps: false })
    expect(b).toContain('SOS from a Bantay family member.')
    expect(b).toContain('could not find my location')
  })
  it('joins numbers with commas, encodes the body, drops unusable numbers', () => {
    const u = smsUri([{ name: 'A', phone: '0917 123-4567' }, { name: 'B', phone: '+63 918 765 4321' }, { name: 'C', phone: '12' }], 'Hi there & you')
    expect(u).toBe('sms:09171234567,+639187654321?body=Hi%20there%20%26%20you')
    expect(smsNumber(' +63 (917) 1')).toBe('+639171')
  })
  it('is null with no contacts so the screen can ask for some', () => {
    expect(smsUri([], 'x')).toBeNull()
    expect(smsUri([{ name: 'A', phone: '' }], 'x')).toBeNull()
  })
})
