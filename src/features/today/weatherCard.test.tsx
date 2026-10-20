import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsCheck } from '../safety/dial'
import type { Entry } from '../safety/entries'
import type { Wx } from './heroCards'
import WeatherCard from './WeatherCard'

const m = vi.hoisted(() => ({ place: { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone' } as unknown, wx: null as unknown }))
vi.mock('../location/useLocation', () => ({ usePlace: () => m.place }))
vi.mock('../safety/store', () => ({ useKv: () => [] }))
vi.mock('./weather', () => ({ useWeather: () => m.wx }))
afterEach(cleanup)

const base: Wx = { temp: 28, rainPct: 10, words: 'clear', at: '2026-10-20T05:00:00Z', humidity: 60, utcOffset: 8 * 3600, tz: 'Asia/Manila' }

describe('Today weather card', () => {
  it('opens plain #weather when no action line shows', () => {
    m.wx = base
    render(<WeatherCard />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('#weather')
  })
  it('opens #weather?from=action when an action line shows, and it is the Weather screen heat-index line', () => {
    m.wx = { ...base, temp: 34, humidity: 70 }
    render(<WeatherCard />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('#weather?from=action')
    expect(screen.getByText(/^Stay indoors/)).toBeTruthy()
  })
  it('hot but dry (low heat index) shows no heat line, so Today and Weather agree', () => {
    m.wx = { ...base, temp: 34, humidity: null }
    render(<WeatherCard />)
    expect(screen.queryByText(/noon sun|Stay indoors/)).toBeNull()
  })
  it('"as of" uses the place time zone when abroad, not Manila', () => {
    m.place = { weather: { lat: 32.78, lon: -96.8 }, zone: 'dampas', source: 'gps-abroad' }
    m.wx = { ...base, utcOffset: -5 * 3600, tz: 'America/Chicago', at: '2026-10-20T05:00:00Z' }
    render(<WeatherCard />)
    expect(screen.getByText('as of 12:00 AM')).toBeTruthy()
  })
})

describe('UNVERIFIED check mark', () => {
  const e = (o: Partial<Entry>): Entry => ({ id: 'a', group: 'g', name: 'n', phone: '1', status: 'UNVERIFIED', source: 's', sourceUrl: null, date: 'd', ...o })
  it('shows on numbers, never on link rows', () => {
    expect(needsCheck(e({}))).toBe(true)
    expect(needsCheck(e({ phone: null, link: true, sourceUrl: 'https://x.test' }))).toBe(false)
  })
})
