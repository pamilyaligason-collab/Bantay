import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RescueMap } from './RescueMap'

const kv = vi.hoisted(() => ({ rows: {} as Record<string, unknown> }))
vi.mock('../safety/store', () => ({ useKv: (k: string, d: unknown) => kv.rows[k] ?? d, putKv: () => Promise.resolve() }))
afterEach(() => { cleanup(); kv.rows = {}; vi.unstubAllGlobals() })

describe('RescueMap offline list', () => {
  it('lists unpinned places with the offline note, and a family pin shows distance and Go', () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    kv.rows = { 'safety.overrides': { 'evac-dao': { lat: 9.6557, lon: 123.878, phone: '0917 000 0000' } } }
    render(<RescueMap lat={9.6457} lon={123.878} zoneName="Dampas" />)
    expect(screen.getByText(/No signal/)).toBeTruthy()
    expect(screen.getByText('Barangay Dampas evacuation centre')).toBeTruthy()
    fireEvent.click(screen.getByText(/Dao evacuation centre/))
    expect(screen.getAllByText(/1.1 km away/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Go' }).getAttribute('href')).toContain('travelmode=driving')
    expect(screen.getByRole('link', { name: /Call 0917/ }).getAttribute('href')).toBe('tel:09170000000')
  })
  it('a filter chip hides its kind', () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    render(<RescueMap lat={9.6457} lon={123.878} />)
    fireEvent.click(screen.getByRole('button', { name: 'Evacuation' }))
    expect(screen.queryByText('Barangay Dampas evacuation centre')).toBeNull()
  })
  it('unknown position with no cache says so instead of guessing', () => {
    render(<RescueMap lat={NaN} lon={NaN} />)
    expect(screen.getByText(/do not know where you are/)).toBeTruthy()
  })
})
