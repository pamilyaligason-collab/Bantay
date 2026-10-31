import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from './alerts'
import Warnings from './Warnings'

const rows = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('./store', () => ({ useKv: () => rows.list }))
vi.mock('./SafetyBrief', () => ({ default: () => <p>brief</p> }))
vi.mock('./NewsTop5', () => ({ default: () => <p>news</p> }))
vi.mock('./PhoneWarnings', () => ({ default: () => <p>phone</p> }))
afterEach(cleanup)

const place = { weather: { lat: 9.65, lon: 123.88 }, zone: 'dampas', source: 'zone' } as never
const quake = {
  id: 'q1', kind: 'quake', level: 'M4.6', title: 'M 4.6 - 7 km NE of Tago', what: '', where: '7 km NE of Tago, Surigao del Sur', when: '', doNow: '', source: 'USGS', sourceUrl: null,
  issuedAt: new Date(Date.now() - 11 * 3_600_000).toISOString(), lat: 9.65 + 272 / 111.2, lon: 123.88, bulletin: '', checkedAt: new Date().toISOString()
} as Alert

describe('Warnings', () => {
  it('shows the quake hero with a felt line, distance and a map region', () => {
    rows.list = [quake]
    render(<Warnings place={place} />)
    const hero = screen.getByTestId('warn-hero')
    expect(hero.textContent).toContain('M4.6')
    expect(hero.textContent).toContain('You may not have felt it')
    expect(hero.textContent).toContain('km from you, in Dampas')
    expect(screen.getByRole('region', { name: /Map of the warning/ })).toBeTruthy()
  })
  it('no alerts: empty card, no map', () => {
    rows.list = []
    render(<Warnings place={place} />)
    expect(screen.getByTestId('warn-hero').textContent).toBe('No warnings on this phone. Last check: never.') // zero rows means no check time to trust
    expect(screen.queryByRole('region', { name: /Map of the warning/ })).toBeNull()
  })
  it('stale or never checked: amber line and an honest empty text', () => {
    rows.list = []
    render(<Warnings place={place} />)
    expect(screen.getByTestId('warn-hero').textContent).toBe('No warnings on this phone. Last check: never.')
    expect(screen.getAllByText(/They may be out of date/).length).toBe(1)
  })
  it('shaking row is collapsed until pressed; sources rows carry freshness', () => {
    rows.list = [quake]
    render(<Warnings place={place} />)
    const b = screen.getByRole('button', { name: /If you ever feel shaking/ })
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/not an earthquake or tsunami siren/)).toBeNull()
    fireEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/not an earthquake or tsunami siren/)).toBeTruthy()
    expect(screen.getByText('Checked just now')).toBeTruthy()
    expect(screen.getAllByText('No rows yet').length).toBe(2)
    expect(screen.queryByText('PHIVOLCS')).toBeNull()
  })
})
