import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { openMeteoFixture } from './fixture'
import { parseForecast, readCached, savedLine } from './forecast'
import { rainBars, rainLevel, rainMode } from './rainBars'
import RainMap from './RainMap'
import { db } from '../../db'

afterEach(cleanup)
const NOW = new Date('2026-10-27T01:15:00Z') // 9:15 AM in Manila
const fc = () => parseForecast(openMeteoFixture({ now: NOW }), NOW.toISOString())!
const P = { lat: 6.11, lon: 125.17 }

describe('rain fallback branch (R3: RainViewer coverage of the Philippines not confirmed)', () => {
  it('uses the hourly bars until coverage is confirmed, the radar only when the flag is set', () => {
    expect(rainMode()).toBe('bars')
    expect(rainMode(false)).toBe('bars')
    expect(rainMode(true)).toBe('radar')
  })
  it('chance words are hand-computed at the edges; unknown is never 0', () => {
    expect([rainLevel(null), rainLevel(0), rainLevel(19), rainLevel(20), rainLevel(39), rainLevel(40), rainLevel(69), rainLevel(70)]).toEqual(['unknown', 'none', 'none', 'light', 'light', 'moderate', 'moderate', 'heavy'])
  })
  it('12 bars start at the current local hour: 9 AM now, 80% from 2 PM (fixture 14-17)', () => {
    const b = rainBars(fc(), 12, NOW.getTime())
    expect(b).toHaveLength(12)
    expect(b[0]!.time.slice(11, 16)).toBe('09:00')
    expect(b[5]!.time.slice(11, 16)).toBe('14:00')
    expect(b[5]).toMatchObject({ pct: 80, level: 'heavy' })
    expect(b[0]).toMatchObject({ pct: 10, level: 'none' })
  })
})

describe('RainMap', () => {
  it('draws bars and the PAGASA radar link, and switches chips', () => {
    render(<RainMap fc={fc()} point={P} placeName="General Santos" alerts={[]} />)
    expect(screen.getByRole('list', { name: 'Chance of rain, next 12 hours' }).children).toHaveLength(12)
    expect(screen.getByRole('link', { name: /Radar images from PAGASA/ }).getAttribute('href')).toMatch(/pagasa\.dost\.gov\.ph/)
    expect(document.querySelector('iframe, img[src*="rainviewer"]')).toBeNull() // nothing loads from a map provider
    fireEvent.click(screen.getByRole('button', { name: 'Wind' }))
    expect(screen.getByRole('status').textContent).toMatch(/Wind now 9 km\/h, gusts to 18 km\/h/)
    fireEvent.click(screen.getByRole('button', { name: 'Storm track' }))
    expect(screen.getByText(/No storm warnings for the Philippines from GDACS/)).toBeTruthy()
  })
  it('storm track lists a GDACS storm and never says no storms while one is listed', () => {
    const a = { id: 'gdacs-TC-1001', kind: 'gdacs', title: 'Tropical Storm PEPITO', where: 'Pepito', issuedAt: '2026-10-25T00:00:00Z', lat: 9.7, lon: 128.5 } as unknown as Alert
    render(<RainMap fc={fc()} point={P} placeName="General Santos" alerts={[a]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Storm track' }))
    expect(screen.queryByText(/No storm warnings/)).toBeNull()
    expect(screen.getAllByText(/Pepito/).length).toBeGreaterThan(0)
  })
})

describe('cache freshness', () => {
  it('"Saved for offline" names the fetch time; a cache older than 24 h is not shown', async () => {
    const f = fc()
    expect(savedLine(f)).toMatch(/^Saved for offline · updated \d{1,2}:\d\d [AP]M$/)
    await db.kv.put({ key: 'weather.forecast.6.11,125.17', value: f })
    expect(await readCached(P, NOW.getTime() + 23 * 3600_000)).not.toBeNull()
    expect(await readCached(P, NOW.getTime() + 25 * 3600_000)).toBeNull()
  })
})
