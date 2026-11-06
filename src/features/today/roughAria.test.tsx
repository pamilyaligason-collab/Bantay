import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Wx } from './heroCards'
import WeatherCard from './WeatherCard'

// a rough (1500 m) live fix in Dampas, Tagbilaran (invented test data)
const m = vi.hoisted(() => ({ place: { weather: { lat: 9.6457, lon: 123.878 }, zone: 'dampas', source: 'gps', settled: true, picked: true, accuracy: 1500, fixAt: Date.now() } as unknown, wx: null as unknown }))
vi.mock('../location/useLocation', () => ({ usePlace: () => m.place }))
vi.mock('../safety/store', () => ({ useKv: () => [] }))
vi.mock('./weather', () => ({ useWeather: () => m.wx }))
afterEach(cleanup)

const wx: Wx = { temp: 28, rainPct: 10, words: 'clear', at: '2026-10-20T05:00:00Z', humidity: 60, utcOffset: 8 * 3600, tz: 'Asia/Manila' }

describe('S22 G: Today weather card with a rough fix', () => {
  it('the cover link aria-label names the plain place; "around" only on the kicker', () => {
    m.wx = wx
    const { container } = render(<WeatherCard />)
    const label = container.querySelector('.td-wx-cover')!.getAttribute('aria-label')!
    expect(label).toBe('Weather in Tagbilaran, 28°, Clear. Open the weather.')
    expect(label).not.toMatch(/around/)
    expect(screen.getByText(/^around Tagbilaran · as of /)).toBeTruthy()
  })
})
