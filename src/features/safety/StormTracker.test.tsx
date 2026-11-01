import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from './alerts'
import { ALERTS_KEY } from './alerts'
import StormTracker from './StormTracker'

const kv = vi.hoisted(() => ({ alerts: [] as unknown[], pref: true }))
vi.mock('./store', () => ({
  useKv: (key: string, fb: unknown) => (key === 'safety.alerts' ? kv.alerts : key === 'safety.windyPause' ? kv.pref : fb),
  putKv: vi.fn()
}))
vi.mock('./StormCard', () => ({ StormBlock: () => <p>roll call</p>, StormCard: () => null }))
afterEach(() => { cleanup(); Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true }) })

const place = { weather: { lat: 9.65, lon: 123.88 }, zone: 'dampas', source: 'zone' } as never
const tc = { id: 'gdacs-TC-1', kind: 'gdacs', issuedAt: '2026-10-12T00:00:00Z', title: 'Tropical Cyclone PEPITO', where: 'Philippines', level: 'Orange', lat: 14, lon: 130, source: 'GDACS', checkedAt: new Date().toISOString() } as Alert
const cellular = () => Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, configurable: true })

describe('StormTracker', () => {
  it('no storms: status, stormLine, PAR map region, no roll call', () => {
    kv.alerts = []
    render(<StormTracker place={place} />)
    expect(ALERTS_KEY).toBe('safety.alerts')
    const st = screen.getByRole('status')
    expect(st.textContent).toContain('No storms now')
    expect(st.textContent).toContain('No storm warnings for the Philippines from GDACS right now')
    expect(screen.getByRole('region', { name: /Philippine Area of Responsibility/ })).toBeTruthy()
    expect(screen.queryByText('roll call')).toBeNull()
    expect(screen.getByText(/Bantay is not a siren/)).toBeTruthy()
  })
  it('wifi: the Windy iframe is there at once', () => {
    kv.alerts = []
    const { container } = render(<StormTracker place={place} />)
    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('overlay=wind')
  })
  it('cellular with the pause on: no iframe until Load live layer is pressed', () => {
    kv.alerts = []; cellular()
    const { container } = render(<StormTracker place={place} />)
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load live layer' }))
    expect(container.querySelector('iframe')).not.toBeNull()
  })
  it('pause switch reflects the saved pref', () => {
    kv.alerts = []; kv.pref = false
    render(<StormTracker place={place} />)
    expect(screen.getByRole('switch', { name: 'Pause on mobile data' }).getAttribute('aria-checked')).toBe('false')
    kv.pref = true
  })
  it('one GDACS storm: name and since row', () => {
    kv.alerts = [tc]
    render(<StormTracker place={place} />)
    expect(screen.getByRole('status').textContent).toContain('1 storm listed')
    expect(screen.getByText('Tropical Cyclone PEPITO')).toBeTruthy()
    expect(screen.getByText(/Orange alert · since/)).toBeTruthy()
  })
  it('roll call only with a live PAGASA signal', () => {
    kv.alerts = [{ ...tc, id: 'pagasa-tcws-1-1', kind: 'tcws', level: 'Signal No. 2', issuedAt: new Date().toISOString() }]
    render(<StormTracker place={place} />)
    expect(screen.getByText('roll call')).toBeTruthy()
  })
})
