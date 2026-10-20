import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SosScreen from './SosScreen'
import { SosStatus, statusRows } from './SosStatus'

vi.mock('./locate', () => ({ sosPosition: async () => ({ lat: 9.65, lon: 123.85, at: 1_790_000_000_000, gps: true }) }))
vi.mock('./useSelf', () => ({ useSelf: () => ({ name: 'Lola', personId: 'p1' }) }))
vi.mock('../auth/family', () => ({ loadFamily: () => [] }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('../shell/useKv', () => ({
  useKv: () => [[{ name: 'Ana', phone: '0917 123 4567' }, { name: 'Ben', phone: '12' }], () => undefined, true]
}))
vi.mock('./SosContactsPicker', () => ({ default: () => null }))

afterEach(cleanup)

const two = [{ name: 'Ana', phone: '0917 123 4567' }, { name: 'Ben', phone: '12' }]

describe('statusRows', () => {
  it('says Ready before the text app opened, Sent after, and flags a contact with no usable number', () => {
    expect(statusRows(two, false).map((r) => r.state)).toEqual(['ready', 'no-number'])
    expect(statusRows(two, true).map((r) => r.state)).toEqual(['sent', 'no-number'])
  })
  it('falls back to the number when a contact has no name', () => {
    expect(statusRows([{ name: ' ', phone: '09171234567' }], true)[0]!.name).toBe('09171234567')
  })
})

describe('SosStatus', () => {
  it('lists the contacts with Sent and never claims delivery', () => {
    render(<SosStatus contacts={two} opened />)
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByText('Text opened')).toBeTruthy()
    expect(screen.getByText('No number')).toBeTruthy()
    expect(document.body.textContent).toMatch(/cannot see if it was sent or delivered/)
    expect(document.body.textContent).not.toMatch(/\bSent\b/)
  })
  it('renders nothing with no contacts', () => {
    render(<SosStatus contacts={[]} opened />)
    expect(screen.queryByTestId('sos-status')).toBeNull()
  })
})

describe('SosStatus in Filipino', () => {
  it('uses the Filipino chip and note', async () => {
    const { setLang } = await import('../../lib/i18n')
    await setLang('fil')
    render(<SosStatus contacts={two} opened />)
    expect(screen.getByText('Bukas ang text')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Hindi po makita ng Bantay/)
    await setLang('en')
  })
})

describe('SosScreen', () => {
  it('shows who the text was prepared for, marks Sent once the text app was opened, and keeps I\'m safe now', async () => {
    const loc = { ...window.location }
    Object.defineProperty(window, 'location', { configurable: true, value: { ...loc, href: '' } })
    render(<SosScreen onClose={() => undefined} />)
    const list = await screen.findByTestId('sos-status')
    await waitFor(() => expect(list.textContent).toContain('Text opened'))
    expect(list.textContent).toContain('Ana')
    fireEvent.click(screen.getByRole('button', { name: /safe now/ }))
    expect(screen.getByText('Glad you are safe')).toBeTruthy()
  })
})
