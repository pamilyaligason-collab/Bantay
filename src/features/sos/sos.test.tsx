import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SosButton from './SosButton'
import { HOLD_MS } from './hold'
import { mapLink, smsNumber, smsUris, sosBody } from './sms'

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

describe('SMS body and links', () => {
  const base = { name: 'Mama', lat: 9.65, lon: 123.88, time: '8:21 AM', gps: true }
  it('builds the agreed body with a maps link, the coordinates and the time', () => {
    expect(sosBody(base)).toBe('Mama needs help. 8:21 AM. Location: https://maps.google.com/?q=9.65,123.88 (9.65000, 123.88000). Sent from Bantay.')
    expect(mapLink(1, 2)).toBe('https://maps.google.com/?q=1,2')
  })
  it('keeps the no-GPS branch: says so when the place is only the home zone, and copes with no name', () => {
    const b = sosBody({ ...base, name: ' ', gps: false })
    expect(b).toBe('A Bantay family member needs help. 8:21 AM. My phone could not find my location. My home area: https://maps.google.com/?q=9.65,123.88 (9.65000, 123.88000). Sent from Bantay.')
  })
  it('unknown place stays unknown: no map link and no 0,0', () => {
    expect(sosBody({ ...base, lat: null, lon: null, gps: false })).toBe('Mama needs help. 8:21 AM. My phone could not find my location. Sent from Bantay.')
  })
  it('one composer per contact, digits only, body encoded, unusable numbers left out', () => {
    const u = smsUris([{ name: 'A', phone: '0917 123-4567' }, { name: 'B', phone: '+63 918 765 4321' }, { name: 'C', phone: '12' }], 'Hi there & you')
    expect(u).toEqual([
      { name: 'A', uri: 'sms:09171234567?body=Hi%20there%20%26%20you' },
      { name: 'B', uri: 'sms:+639187654321?body=Hi%20there%20%26%20you' }])
    expect(u.every((x) => !x.uri.includes(','))).toBe(true) // never a two-recipient sms: link
    expect(smsNumber(' +63 (917) 1')).toBe('+639171')
  })
  it('is empty with no contacts so the screen can ask for some', () => {
    expect(smsUris([], 'x')).toEqual([])
    expect(smsUris([{ name: 'A', phone: '' }], 'x')).toEqual([])
  })
})
