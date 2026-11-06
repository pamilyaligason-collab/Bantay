import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entriesFromPack, type PackPlace } from './entries'

const state = vi.hoisted(() => ({ entries: null as unknown[] | null }))
vi.mock('./usePacks', () => ({ usePackEntries: () => ({ unit: state.entries ? 'U1' : null, entries: state.entries }) }))
vi.mock('./Call911', () => ({ useAbroad: () => false, Call911: () => null }))
vi.mock('../rescuemap/RescueMap', () => ({ RescueMap: (p: { seed?: unknown[] }) => <div data-testid="rm" data-seed={p.seed ? p.seed.length : 'none'} /> }))
vi.mock('./EntryList', () => ({ default: () => <div data-testid="entrylist" />, EditForm: () => null }))
import { MapSub, PackDial } from './SafetyPages'
afterEach(() => { cleanup(); state.entries = null })

const NOW = Date.parse('2026-11-04T00:00:00Z')
const row = (o: Partial<PackPlace>): PackPlace => ({ id: 'r', psgc: '1', kind: 'hospital', name: 'Invented Hospital', address: null, phones: [], lat: null, lon: null, capacity: null, status: 'confirmed', source: 'Invented source', url: null, licence: 'x', dated: null, verified: '2026-10-01', confidence: 'high', ...o })
const dampas = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone' } as never
const away = { weather: { lat: 14.5, lon: 121 }, zone: 'dampas', source: 'gps' } as never

describe('PackDial', () => {
  it('shows a Call button for a dialable number and copy text for one that is not, with the date rules', () => {
    state.entries = entriesFromPack([
      row({ id: 'a', name: 'Ward A', phones: ['(083) 552-3221'], kind: 'hospital' }),
      row({ id: 'b', name: 'Office B', phones: ['552-3939'], kind: 'drrmo', status: 'not_confirmed', verified: '2024-01-01' }),
      row({ id: 'c', name: 'No number C', phones: [], kind: 'evac' })
    ], NOW)
    render(<PackDial place={dampas} onInfo={() => {}} />)
    expect(screen.getByRole('link', { name: 'Call Ward A, (083) 552-3221' }).getAttribute('href')).toBe('tel:0835523221')
    expect(screen.queryByRole('link', { name: /Office B/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy 552-3939' })).toBeTruthy()
    expect(screen.getByTestId('pack-b').textContent).toContain('As of 2024-01-01 · May be out of date · Number not confirmed')
    expect(screen.getByTestId('pack-a').textContent).toContain('As of 2026-10-01')
    expect(screen.getByTestId('pack-a').textContent).not.toContain('out of date')
    expect(screen.queryByText('No number C')).toBeNull()
  })
  it('copy puts the number on the clipboard', () => {
    const write = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    state.entries = entriesFromPack([row({ id: 'b', phones: ['552-3939'] })], NOW)
    render(<PackDial place={dampas} onInfo={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy 552-3939' }))
    expect(write).toHaveBeenCalledWith('552-3939')
  })
  it('renders nothing with no pack (flag off or no data): no fake rows', () => {
    state.entries = null
    const { container } = render(<PackDial place={dampas} onInfo={() => {}} />)
    expect(container.textContent).toBe('')
  })
})

describe('MapSub', () => {
  it('with a pack, the map reads the pack even away from the home areas', () => {
    state.entries = entriesFromPack([row({ id: 'a', kind: 'evac', lat: 9.1, lon: 123.1 })], NOW)
    render(<MapSub place={away} />)
    expect(screen.getByTestId('rm').getAttribute('data-seed')).toBe('1')
  })
  it('with no pack away from the home areas: the honest empty state, no list', () => {
    render(<MapSub place={away} />)
    expect(screen.queryByTestId('rm')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('We have no verified list for where you are yet')
  })
  it('with no pack in a home zone: today\'s static list (no seed)', () => {
    render(<MapSub place={dampas} />)
    expect(screen.getByTestId('rm').getAttribute('data-seed')).toBe('none')
  })
})
