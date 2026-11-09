import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsCheck } from '../safety/dial'
import type { Entry } from '../safety/entries'
import { wxLocal, type Wx } from './heroCards'
import WeatherCard from './WeatherCard'

const m = vi.hoisted(() => ({ place: { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false } as unknown, wx: null as unknown }))
vi.mock('../weather/weatherPlace', () => ({ useWeatherPlace: () => ({ place: m.place, point: (m.place as { weather?: unknown } | null)?.weather ?? null }) }))
vi.mock('../safety/store', () => ({ useKv: () => [] }))
vi.mock('./weather', () => ({ useWeather: () => m.wx }))
afterEach(cleanup)

const base: Wx = { temp: 28, rainPct: 10, words: 'clear', at: '2026-10-20T05:00:00Z', humidity: 60, utcOffset: 8 * 3600, tz: 'Asia/Manila' }

describe('Today weather card', () => {
  it('opens plain #weather when no action line shows', () => {
    m.wx = base
    render(<WeatherCard />)
    expect(screen.getByRole('link', { name: /^(?!Weather data)/ }).getAttribute('href')).toBe('#weather')
  })
  it('opens #weather?from=action when an action line shows, and it is the Weather screen heat-index line', () => {
    m.wx = { ...base, temp: 34, humidity: 70 }
    render(<WeatherCard />)
    expect(screen.getByRole('link', { name: /^(?!Weather data)/ }).getAttribute('href')).toBe('#weather?from=action')
    expect(screen.getByText(/^Stay indoors/)).toBeTruthy()
  })
  it('hot but dry (low heat index) shows no heat line, so Today and Weather agree', () => {
    m.wx = { ...base, temp: 34, humidity: null }
    render(<WeatherCard />)
    expect(screen.queryByText(/noon sun|Stay indoors/)).toBeNull()
  })
  it('compact: temperature, condition, place, a feels pill, a chevron and no glyph arrow; 196 px size flag', () => {
    m.wx = { ...base, temp: 31, humidity: 70, words: 'partly cloudy' }
    const { container } = render(<WeatherCard />)
    expect(screen.getByText('31°')).toBeTruthy()
    expect(screen.getByText('Partly cloudy')).toBeTruthy()
    expect(screen.getByText(/^Dampas · your home area · as of /)).toBeTruthy()
    expect(screen.getByText(/^Feels 3\d° · Extreme caution$/)).toBeTruthy()
    expect(screen.getByText('Drink water')).toBeTruthy()
    expect(container.querySelector('.td-wx-chev svg')).toBeTruthy()
    expect(container.textContent).not.toContain('›')
    expect(container.querySelector('[data-size="compact"]')).toBeTruthy()
  })
  it('compact: the action is one plain line, no box and no Jack', () => {
    m.wx = { ...base, temp: 34, humidity: 70 }
    const { container } = render(<WeatherCard />)
    expect(container.querySelector('.td-act-box')).toBeNull()
    expect(container.querySelector('.td-wxh-line')!.textContent).toMatch(/^Stay indoors/)
    expect(container.querySelector('img.jack')).toBeNull()
  })
  it('one feels like and one danger label: the heat index (same as the action line and the Weather screen), not the forecast apparent temperature', () => {
    m.wx = { ...base, temp: 33, humidity: 70, feels: 42 }
    render(<WeatherCard />)
    expect(screen.getByText('Feels 43° · Danger')).toBeTruthy()
  })
  it('no heat index (no humidity): the forecast apparent temperature, no label, no Drink water', () => {
    m.wx = { ...base, temp: 33, humidity: null, feels: 38 }
    render(<WeatherCard />)
    expect(screen.getByText('Feels 38°')).toBeTruthy()
    expect(screen.queryByText('Drink water')).toBeNull()
  })
  it('a storm draws the night storm scene, the storm copy and never Jack', () => {
    m.wx = { ...base, temp: 26, humidity: 80, feels: 31, code: 0 }
    const { container } = render(<WeatherCard expanded storm />)
    expect(container.querySelector('.wxs')!.getAttribute('data-cond')).toBe('storm')
    expect(container.querySelector('.wxs')!.getAttribute('data-tod')).toBe('night')
    expect(screen.getByText('Rain and strong wind.')).toBeTruthy()
    expect(container.querySelector('img.jack')).toBeNull()
  })
  it('draws the scene for the weather code and time of day', () => {
    m.wx = { ...base, code: 63, sunrise: '2000-01-01T05:50', sunset: '2000-01-01T17:45' }
    const { container } = render(<WeatherCard />)
    const s = container.querySelector('.wxs')!
    expect(s.getAttribute('data-cond')).toBe('rain')
    expect(['night', 'dawn', 'day', 'dusk']).toContain(s.getAttribute('data-tod'))
    expect(s.getAttribute('aria-hidden')).toBe('true')
  })
  it('no feels like without humidity', () => {
    m.wx = { ...base, temp: 34, humidity: null }
    render(<WeatherCard />)
    expect(screen.queryByText(/Feels like/)).toBeNull()
  })
})

describe('Today weather card, expanded', () => {
  const hours = (n: number) => {
    const t0 = new Date(`${wxLocal(base, new Date()).slice(0, 13)}:00:00Z`).getTime()
    const time = Array.from({ length: n }, (_, i) => new Date(t0 + i * 3600_000).toISOString().slice(0, 16))
    return { time, prob: time.map((_, i) => 10 * i), code: time.map(() => 61), temp: time.map(() => 27) }
  }
  it('is the hero: eyebrow with place and as-of, big temperature, condition, range, three slots, one link to #weather', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    m.wx = { ...base, temp: 33, humidity: 68, words: 'partly cloudy', code: 2, high: 34, low: 26, hourly: hours(24) }
    const { container } = render(<WeatherCard expanded review={0} />)
    expect(screen.getByText(/^Dampas · your home area · as of /)).toBeTruthy()
    expect(container.querySelector('.td-wxh-t')!.textContent).toBe('33°')
    expect(screen.getByText('Partly cloudy')).toBeTruthy()
    expect(screen.getByText('Feels 43° · Danger')).toBeTruthy()
    expect(screen.getByText('High 34° · Low 26°')).toBeTruthy() // live parity: today's range stays on the expanded card
    expect(container.querySelector('[data-size="expanded"]')).toBeTruthy()
    expect(container.querySelectorAll('.td-hs li')).toHaveLength(12)
    expect(screen.getByText('30% rain')).toBeTruthy() // slot 3 hours on
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://open-meteo.com/', '#weather', '#weather?from=action']) // the Open-Meteo credit link, Full forecast row, then the cover link // Full forecast row, then the cover link
    expect(screen.getByRole('link', { name: /Full forecast/ })).toBeTruthy()
    expect([...container.querySelectorAll('.td-hs li')].slice(1).every((li) => li.textContent!.includes('27°'))).toBe(true) // every later item shows its temperature; the first is now (33°)
    expect(container.querySelector('.td-act-box svg')).toBeNull() // T7: no icon on the rain pill
    expect(container.querySelector('.td-act-box')).toBeTruthy()
    expect(screen.queryByText(/medicines/)).toBeNull()
  })
  it('T16: under a storm the hero title, slots and line agree: storm icons, none under 60%', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    m.wx = { ...base, temp: 27, words: 'cloudy', code: 3, high: 30, low: 25, hourly: { ...hours(24), prob: hours(24).time.map(() => 10), code: hours(24).time.map(() => 3) } }
    const { container } = render(<WeatherCard expanded review={0} storm />)
    expect(screen.getByText('Thunderstorm')).toBeTruthy()
    expect(screen.getByText('Rain and strong wind.')).toBeTruthy()
    expect(screen.getByText('High 30° · Low 25°')).toBeTruthy() // the range stays under a storm
    expect(screen.queryByText('10%')).toBeNull()
    const li = [...container.querySelectorAll('.td-hs li')]
    expect(li).toHaveLength(12)
    expect(li.every((x) => x.textContent!.includes('60%'))).toBe(true)
  })
  it('T5: 55% this evening gives the hero its own rain line', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z')) // 4 PM at the place
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    const t = hours(24).time
    m.wx = { ...base, temp: 27, words: 'cloudy', code: 3, hourly: { time: t, prob: t.map((x) => (x.slice(11, 13) === '19' ? 55 : 0)), code: t.map(() => 3) } }
    render(<WeatherCard expanded review={0} />)
    expect(screen.queryByText('Rain 55% this evening')).toBeTruthy()
    vi.useRealTimers()
  })
  const withMm = (mm: (h: string) => number) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z')) // 4 PM at the place
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    const t = hours(24).time
    m.wx = { ...base, temp: 27, words: 'cloudy', code: 3, hourly: { time: t, prob: t.map(() => 80), mm: t.map((x) => mm(x.slice(11, 13))), code: t.map(() => 3) } }
    return render(<WeatherCard expanded review={0} />)
  }
  it('cloudy 80% with 0 mm: no rain tip beside "No rain in the next 2 hours"', () => {
    const { container } = withMm(() => 0)
    expect(container.textContent).toContain('No rain in the next 2 hours')
    expect(container.textContent).not.toMatch(/Rain 80%|then rain|Bring an umbrella|Rain likely/)
    vi.useRealTimers()
  })
  it('rain only from 8 PM (mm > 0): the tip names 8 PM while the next 2 hours stay dry', () => {
    const { container } = withMm((h) => (h === '20' ? 1.2 : 0))
    expect(container.textContent).toContain('No rain in the next 2 hours')
    expect(container.textContent).toMatch(/till 8 PM, then rain/)
    vi.useRealTimers()
  })
  it('a heat danger line is never replaced by a 40% rain mention', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z')) // noon at the place
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    const t = hours(24).time
    m.wx = { ...base, temp: 34, humidity: 70, hourly: { time: t, prob: t.map((x) => (x.slice(11, 13) === '19' ? 40 : 0)), code: t.map(() => 2) } }
    render(<WeatherCard expanded review={0} />)
    expect(screen.getByText(/^Stay indoors/)).toBeTruthy()
    expect(screen.queryByText(/^Rain 40%/)).toBeNull()
    vi.useRealTimers()
  })
  it('compact keeps the 3-slot hourly strip but drops the range and the action box (PLAN 1.1 row 2)', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    m.wx = { ...base, temp: 33, humidity: 68, words: 'partly cloudy', code: 2, high: 34, low: 26, hourly: hours(24) }
    const { container } = render(<WeatherCard />)
    expect(container.querySelector('[data-size="compact"]')).toBeTruthy()
    expect(container.querySelectorAll('.td-wxh-hrs li')).toHaveLength(3)
    expect(screen.queryByText(/^High /)).toBeNull()
    expect(container.querySelector('.td-act-box')).toBeNull()
  })
  it('a slot with no rain chance draws no dash glyph (D-103 rule 1)', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    const h = hours(24)
    m.wx = { ...base, temp: 33, humidity: 68, hourly: { ...h, prob: h.prob.map(() => null) } as never }
    const { container } = render(<WeatherCard expanded />)
    expect(container.querySelectorAll('.td-hs li').length).toBe(12)
    expect(container.querySelector('.td-hs')!.textContent).not.toContain('–')
  })
  it('"as of" uses the place time zone when abroad, not Manila', () => {
    m.place = { weather: { lat: 32.78, lon: -96.8 }, zone: 'dampas', source: 'gps-abroad' }
    m.wx = { ...base, utcOffset: -5 * 3600, tz: 'America/Chicago', at: '2026-10-20T05:00:00Z' }
    render(<WeatherCard expanded />)
    expect(screen.getByText(/as of 12:00 AM/)).toBeTruthy()
  })
  it('quiet medicines row with the count, linking to the medicines screen', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    m.wx = base
    render(<WeatherCard expanded review={2} />)
    const a = screen.getByRole('link', { name: /Nothing due right now · 2 medicines to check/ })
    expect(a.getAttribute('href')).toBe('#health/meds')
  })
})

describe('UNVERIFIED check mark', () => {
  const e = (o: Partial<Entry>): Entry => ({ id: 'a', group: 'g', name: 'n', phone: '1', status: 'UNVERIFIED', source: 's', sourceUrl: null, date: 'd', ...o })
  it('shows on numbers, never on link rows', () => {
    expect(needsCheck(e({}))).toBe(true)
    expect(needsCheck(e({ phone: null, link: true, sourceUrl: 'https://x.test' }))).toBe(false)
  })
})
