import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from './alerts'
import { FLAGS } from './flags'
import Warnings from './Warnings'
import { zoneAlert } from '../today/heroCards'

const rows = vi.hoisted(() => ({ list: [] as unknown[], checked: null as unknown, seen: [] as unknown[], eonet: [] as unknown[] }))
vi.mock('./store', () => ({ useKv: (k: string, fb: unknown) => (k === 'alerts:checkedAt' ? rows.checked : k === 'alerts:lastSeen' ? rows.seen : k === 'safety.alerts' ? rows.list : k === 'safety.eonet' ? rows.eonet : fb) }))
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
    expect(hero.textContent).toContain('Probably too far to feel strongly. If you felt shaking, follow the steps below.') // 272 km, M4.6, 11 h old, but only the home zone is known
    expect(hero.textContent).not.toMatch(/no action/i)
    expect(hero.textContent).toContain('km from you, in Dampas')
    expect(screen.getByRole('region', { name: /Map of the warning/ })).toBeTruthy()
  })
  it('the same quake with a live position in a named area: the board wording, naming the area', () => {
    rows.list = [{ ...quake, lat: 7.07 + 272 / 111.2, lon: 125.6 }]
    render(<Warnings place={{ weather: { lat: 7.07, lon: 125.6 }, zone: 'conel', source: 'gps', fixAt: Date.now() - 60_000 } as never} />)
    expect(screen.getByTestId('warn-hero').textContent).toContain('Too far to feel in Davao. No action needed.')
  })
  it('left open with no new data: the 30 minute live limit ticks, and the hero drops to the soft line', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      rows.list = [{ ...quake, lat: 7.07 + 272 / 111.2, lon: 125.6 }]
      render(<Warnings place={{ weather: { lat: 7.07, lon: 125.6 }, zone: 'conel', source: 'gps', fixAt: Date.now() - 60_000 } as never} />)
      expect(screen.getByTestId('warn-hero').textContent).toContain('No action needed.')
      act(() => { vi.advanceTimersByTime(31 * 60_000) })
      expect(screen.getByTestId('warn-hero').textContent).toContain('Probably too far to feel strongly.')
      expect(screen.getByTestId('warn-hero').textContent).not.toMatch(/no action/i)
    } finally { vi.useRealTimers() }
  })
  describe('a quiet quake leads only when nothing else is listed', () => {
    const q = (id: string, mag: number, km: number, minAgo: number) => ({ ...quake, id, level: `M${mag}`, title: `M ${mag} ${id}`, lat: 9.65 + km / 111.2, issuedAt: new Date(Date.now() - minAgo * 60_000).toISOString() } as Alert)
    const hero = (list: Alert[]) => { rows.list = list; render(<Warnings place={place} />); return screen.getByTestId('warn-hero').textContent! }
    it('old M4.2 at 105 km plus an old M5.5 inside its radius at 190 km: the M5.5 leads, as on Today', () => {
      const list = [q('small', 4.2, 105, 300), q('big', 5.5, 190, 300)]
      expect(zoneAlert(list, { lat: 9.65, lon: 123.88 })!.id).toBe('big')
      const t = hero(list)
      expect(t).toContain('M5.5')
      expect(t).toContain('You may have felt this in Dampas')
    })
    it('old M4.7 at 120 km plus an M6.7 at 450 km: the M6.7 leads with the tsunami line, as on Today', () => {
      const list = [q('small', 4.7, 120, 300), q('big', 6.7, 450, 300)]
      expect(zoneAlert(list, { lat: 9.65, lon: 123.88 })!.id).toBe('big')
      const t = hero(list)
      expect(t).toContain('M6.7')
      expect(t).toContain('watch for a tsunami warning')
    })
    it('old M5.0 at 205 km plus a 3-minute-old M5.4 aftershock at 215 km: the fresh one leads', () => {
      const t = hero([q('old', 5, 205, 300), q('fresh', 5.4, 215, 3)])
      expect(t).toContain('M5.4')
      expect(t).toContain('About 215 km away. You may feel it.')
    })
    it('old M4.6 at 272 km plus a Red GDACS cyclone at 400 km: the cyclone leads', () => {
      const t = hero([q('old', 4.6, 272, 300), { ...quake, id: 'g', kind: 'gdacs', level: 'Red', title: 'Red tropical cyclone', source: 'GDACS', lat: 9.65 + 400 / 111.2, issuedAt: new Date().toISOString() } as Alert])
      expect(t).toContain('WORLD EVENT')
      expect(t).toContain('Red')
    })
  })
  it('a fresh row with no point (air) is shown, never "No active warnings", and has no map', () => {
    const air = { ...quake, id: 'a1', kind: 'air', level: 'Poor', title: 'Air quality: Poor', lat: null, lon: null, issuedAt: new Date().toISOString() } as unknown as Alert
    rows.list = [air]; rows.checked = new Date().toISOString()
    render(<Warnings place={place} />)
    rows.checked = null
    const hero = screen.getByTestId('warn-hero')
    expect(hero.textContent).toContain('AIR QUALITY')
    expect(hero.textContent).not.toContain('No active warnings')
    expect(screen.queryByRole('region', { name: /Map of the warning/ })).toBeNull()
  })
  it('no alerts: empty card, no map', () => {
    rows.list = []
    render(<Warnings place={place} />)
    expect(screen.getByTestId('warn-hero').textContent).toBe('No warnings on this phone. Last check: never.') // zero rows means no check time to trust
    expect(screen.queryByRole('region', { name: /Map of the warning/ })).toBeNull()
  })
  it('quiet day: empty list with a fresh pull time is calm, with no stale note', () => {
    rows.list = []; rows.checked = new Date().toISOString()
    render(<Warnings place={place} />)
    expect(screen.getByTestId('warn-hero').textContent).toContain('No active warnings')
    expect(screen.queryByText(/They may be out of date/)).toBeNull()
    rows.checked = null
  })
  it('empty list with an old pull time reads stale', () => {
    rows.list = []; rows.checked = new Date(Date.now() - 5 * 3_600_000).toISOString()
    render(<Warnings place={place} />)
    expect(screen.getByTestId('warn-hero').textContent).toContain('No warnings on this phone')
    expect(screen.getAllByText(/They may be out of date/).length).toBe(1)
    rows.checked = null
  })
  it('stale or never checked: amber line and an honest empty text', () => {
    rows.list = []
    render(<Warnings place={place} />)
    expect(screen.getByTestId('warn-hero').textContent).toBe('No warnings on this phone. Last check: never.')
    expect(screen.getAllByText(/They may be out of date/).length).toBe(1)
  })
  it('R1 stopped ingest: phone pulled now but the newest fetched_at is 10 days old -> not Live, no "Checked 3 min ago", no all-clear', () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString()
    rows.list = []; rows.checked = old
    render(<Warnings place={place} />)
    expect(screen.queryByText('Live')).toBeNull()
    expect(screen.queryByText(/Checked \d+ min ago/)).toBeNull()
    expect(screen.getAllByText('Checked 10 days ago').length).toBe(3)
    expect(screen.getByTestId('warn-hero').textContent).not.toContain('No active warnings')
    expect(screen.getAllByText(/They may be out of date/).length).toBe(1)
    rows.checked = null
  })
  it('R1 a stale source row is not Live and blocks the all-clear even with a fresh stamp', () => {
    rows.list = [{ ...quake, id: 'g1', kind: 'gdacs', source: 'GDACS', stale: true, lat: null, lon: null, issuedAt: new Date().toISOString(), checkedAt: new Date(Date.now() - 5 * 3_600_000).toISOString() }]
    rows.checked = new Date().toISOString()
    render(<Warnings place={place} />)
    expect(screen.getAllByText(/They may be out of date/).length).toBe(1)
    expect(screen.queryByText('Checked 5 h ago')?.textContent).toBeTruthy()
    rows.checked = null
  })
  it('R1 phone in another city: names the area it is in, never a home zone', () => {
    const away = { weather: { lat: 7.07, lon: 125.6 }, zone: 'conel', source: 'gps' } as never
    rows.list = [{ ...quake, lat: 7.07 + 20 / 111.2, lon: 125.6 }]
    render(<Warnings place={away} />)
    const t = screen.getByTestId('warn-hero').textContent!
    expect(t).not.toMatch(/Conel|Dampas/)
    expect(t).toContain('km from you')
    expect(t).toContain('in Davao')
  })
  it('R1 Last event comes from the kept row when the pull holds none', () => {
    rows.list = []; rows.checked = new Date().toISOString()
    rows.seen = [{ ...quake, issuedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }]
    render(<Warnings place={place} />)
    expect(screen.getByTestId('wn-last').textContent).toContain('3 days ago')
    rows.seen = []; rows.checked = null
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
    expect(screen.getAllByText('Checked just now').length).toBe(3) // the quake row is fresh; the other two sources take the pull time, which is the same newest row
    expect(screen.queryByText('No rows yet')).toBeNull()
    expect(screen.queryByText('PHIVOLCS')).toBeNull()
  })
  it('W1: no live rows but the pull ran 4 min ago: the three sources read Checked 4 min ago, never Stale', () => {
    rows.list = []; rows.checked = new Date(Date.now() - 4 * 60_000).toISOString()
    render(<Warnings place={place} />)
    expect(screen.getAllByText('Checked 4 min ago').length).toBe(3)
    expect(screen.queryByText('Stale')).toBeNull()
    expect(screen.getAllByText('Live').length).toBe(3)
    rows.checked = null
  })
  it('W1: no signal at all reads Never checked and is not badged Stale', () => {
    rows.list = []; rows.checked = null
    render(<Warnings place={place} />)
    expect(screen.getAllByText('Never checked').length).toBe(3)
    expect(screen.queryByText('Stale')).toBeNull()
    expect(screen.queryByText('Live')).toBeNull()
  })
  it('W1: checks stopped (last pull 5 h ago): Stale is shown', () => {
    rows.list = []; rows.checked = new Date(Date.now() - 5 * 3_600_000).toISOString()
    render(<Warnings place={place} />)
    expect(screen.getAllByText('Stale').length).toBe(3)
    rows.checked = null
  })
})

describe('EONET rows (Phase 2 lane A)', () => {
  const storm = {
    id: 'eonet-EONET_T', kind: 'eonet', level: '65 kts', title: 'Test Storm Alpha', what: '', where: '', when: '', doNow: '', source: 'EONET', sourceUrl: null,
    issuedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), lat: 15, lon: 130, bulletin: ''
  } as Alert
  afterEach(() => { rows.eonet = []; rows.list = []; FLAGS.eonet = false })
  it('flag off: stored EONET rows are not shown, and the screen is the one without them', () => {
    rows.eonet = [storm]
    render(<Warnings place={place} />)
    expect(screen.queryByTestId('wn-radar')).toBeNull()
    expect(screen.queryByText('Test Storm Alpha')).toBeNull()
  })
  it('flag on: they appear under their own heading, labelled awareness only, never as the hero', () => {
    FLAGS.eonet = true
    rows.eonet = [storm]
    render(<Warnings place={place} />)
    const radar = screen.getByTestId('wn-radar')
    expect(radar.textContent).toContain('Test Storm Alpha')
    expect(radar.textContent).toContain('EONET · 3 h ago')
    expect(radar.textContent).toContain('65 kts')
    expect(radar.textContent).toContain('Not an official warning.')
    expect(screen.getByTestId('warn-hero').textContent).toMatch(/^No warnings on this phone/) // an EONET row never takes the hero (no checked time in this test, so the stale wording)
    expect(screen.getByTestId('warn-hero').textContent).not.toContain('Test Storm Alpha')
  })
  it('flag on with no EONET rows: no empty section', () => {
    FLAGS.eonet = true
    render(<Warnings place={place} />)
    expect(screen.queryByTestId('wn-radar')).toBeNull()
  })
  it('flag on shows at most five', () => {
    FLAGS.eonet = true
    rows.eonet = Array.from({ length: 8 }, (_, i) => ({ ...storm, id: `e${i}`, title: `Radar ${i}` }))
    render(<Warnings place={place} />)
    expect(screen.getByTestId('wn-radar').querySelectorAll('.rw').length).toBe(5)
  })
})
