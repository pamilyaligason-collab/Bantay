import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from './alerts'
import { ALERTS_KEY } from './alerts'
import StormTracker from './StormTracker'

const kv = vi.hoisted(() => ({ alerts: [] as unknown[], pref: true, checked: new Date().toISOString() as string | null, seen: [] as unknown[] }))
vi.mock('./store', () => ({
  useKv: (key: string, fb: unknown) => (key === 'safety.alerts' ? kv.alerts : key === 'safety.windyPause' ? kv.pref : key === 'alerts:checkedAt' ? kv.checked : key === 'alerts:lastSeen' ? kv.seen : fb),
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
    expect(st.textContent).toContain('No storm near the Philippines now')
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
  it('R1 stopped ingest: newest fetched_at 10 days old, no storm -> not checked, no all-clear sentence, non-calm dot', () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString()
    kv.alerts = [{ ...tc, id: 'air-x', kind: 'air', checkedAt: old }]; kv.checked = old
    const { container } = render(<StormTracker place={place} />)
    const t = screen.getByRole('status').textContent!
    expect(t).toContain('Storms not checked lately')
    expect(t).not.toMatch(/No storm/)
    expect(t).toContain('not been checked')
    expect(container.querySelector('.st-dot')?.getAttribute('data-on')).toBe('watch')
    expect(container.textContent).toContain('checked 10 days ago')
    kv.checked = new Date().toISOString()
  })
  it('R1 a stale row means no all-clear even when the stamp is fresh', () => {
    kv.alerts = [{ ...tc, id: 'pagasa-x', kind: 'tcws', stale: true, checkedAt: new Date().toISOString() }]
    render(<StormTracker place={place} />)
    expect(screen.getByRole('status').textContent).toContain('Storms not checked lately')
  })
  it('R1 phone in another city: the storm line never names the home zone', () => {
    kv.alerts = [tc]
    const away = { weather: { lat: 7.07, lon: 125.6 }, zone: 'conel', source: 'gps' } as never
    render(<StormTracker place={away} />)
    expect(screen.getByRole('status').textContent).not.toMatch(/Conel|Dampas/)
    expect(screen.getByRole('status').textContent).toContain('of Davao')
  })
  it('R1 Last storm comes from the kept row when the pull holds no cyclone', () => {
    kv.alerts = []; kv.seen = [{ ...tc, issuedAt: '2026-10-01T00:00:00Z' }]
    render(<StormTracker place={place} />)
    expect(screen.getByTestId('st-last').textContent).toContain('Tropical Cyclone PEPITO')
    kv.seen = []
  })
  it('R4 phone in Texas, typhoon near home: the distance is from home and the tone is not calm', () => {
    kv.alerts = [{ ...tc, lat: 10.5, lon: 124.5 }]
    const abroad = { weather: { lat: 32.78, lon: -96.8 }, zone: 'dampas', source: 'gps-abroad' } as never
    const { container } = render(<StormTracker place={abroad} />)
    const t = screen.getByRole('status').textContent!
    expect(t).toContain('about 100 km north-east of Dampas') // 95 km north and 68 km east of Dampas: 117 km, rounded to 50s
    expect(t).not.toMatch(/far from/)
    expect(container.querySelector('.st-line')?.className).toContain('watch')
  })
  it('R4 a live PAGASA signal GDACS has not listed: never "No storm", watch dot, Signal in the heading', () => {
    kv.alerts = [{ ...tc, id: 'pagasa-tcws-1-1', kind: 'tcws', level: 'Signal No. 1', issuedAt: new Date().toISOString() }]
    const { container } = render(<StormTracker place={place} />)
    const t = screen.getByRole('status').textContent!
    expect(t).toContain('Signal No. 1 in force')
    expect(t).not.toMatch(/No storm/)
    expect(container.querySelector('.st-dot')?.getAttribute('data-on')).toBe('watch')
    expect(container.querySelector('.st-line')?.className).toContain('watch')
  })
  it('R4 a signal over a far GDACS storm: no "far from" calm line', () => {
    kv.alerts = [tc, { ...tc, id: 'pagasa-tcws-1-1', kind: 'tcws', level: 'Signal No. 1', issuedAt: new Date().toISOString() }]
    const far = { weather: { lat: 5, lon: 100 }, zone: 'dampas', source: 'gps' } as never
    const { container } = render(<StormTracker place={far} />)
    expect(container.querySelector('.st-line')?.className).toContain('watch')
    expect(screen.getByRole('status').textContent).not.toMatch(/far from/)
  })
  it('R4 Last storm says when it started, since the date is issued_at', () => {
    kv.alerts = []; kv.seen = [{ ...tc, issuedAt: '2026-10-01T00:00:00Z' }]
    render(<StormTracker place={place} />)
    expect(screen.getByTestId('st-last').textContent).toContain('started')
    expect(screen.getByTestId('st-last').textContent).not.toContain('last listed')
    kv.seen = []
  })
  it('never checked: no "No storm" claim', () => {
    kv.alerts = []; kv.checked = null
    render(<StormTracker place={place} />)
    expect(screen.getByRole('status').textContent).toContain('Storms not checked lately')
    expect(screen.getByRole('status').textContent).not.toContain('No storm near')
    kv.checked = new Date().toISOString()
  })
})
