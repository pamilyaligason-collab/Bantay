import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsCheck } from '../safety/dial'
import type { Entry } from '../safety/entries'
import { wxLocal, type Wx } from './heroCards'
import { hourlySlots } from './HourlyStrip'
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
    expect(screen.getByText(/^Dampas, Tagbilaran · as of\s/)).toBeTruthy()
    expect(screen.getByText(/^Feels 3\d°$/)).toBeTruthy()
    expect(screen.getByText('Extreme caution')).toBeTruthy()
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
    expect(screen.getByText('Feels 43°')).toBeTruthy()
    expect(screen.getByText('Danger')).toBeTruthy()
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

describe('Today weather card, stale location (S28)', () => {
  it('a fix 3 days 9 minutes old reads in words, with an upper-case clock: "last known, 3 days ago · as of 9:09 PM"', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.parse('2026-11-09T13:30:00Z')
    vi.setSystemTime(now)
    m.place = { weather: { lat: 9.65, lon: 123.85 }, zone: 'dampas', source: 'last', settled: true, picked: true, fixAt: now - (3 * 1440 + 9) * 60_000 }
    m.wx = { ...base, at: '2026-11-09T13:09:00Z' } // 13:09 UTC = 9:09 PM in Manila
    const { container } = render(<WeatherCard />)
    const kicker = container.textContent!.replace(/ /g, ' ')
    expect(kicker).toContain('Tagbilaran · last known, 3 days ago · as of 9:09 PM')
    expect(kicker).not.toMatch(/\d\s?(d|m|h)\b|\d\s?(am|pm)\b/)
    vi.useRealTimers()
  })
})

describe('Today weather card, rain now and no fix', () => {
  it('raining now (model) reads Rain with the rain scene and no strong-sun tip', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: true }
    m.wx = { ...base, temp: 31, words: 'partly cloudy', code: 2, uvMax: 10, precip: 1.2, rainingNow: { value: true, source: 'model', ageMin: null } }
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText('Light rain')).toBeTruthy()
    expect(screen.queryByText('Partly cloudy')).toBeNull()
    expect(container.querySelector('.wxs')!.getAttribute('data-cond')).toBe('rain')
    expect(container.textContent).not.toMatch(/Strong sun/)
  })
  it('raining now with more rain later: never "Dry till", says More rain likely from', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T02:00:00Z')) // 10:00 in Manila
    const time = Array.from({ length: 12 }, (_, i) => `2026-10-20T${String(10 + i).padStart(2, '0')}:00`)
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: true }
    m.wx = { ...base, temp: 27, humidity: 60, words: 'partly cloudy', code: 2, precip: 1.2, rainingNow: { value: true, source: 'model', ageMin: null }, hourly: { time, prob: time.map((_, i) => (i >= 5 ? 70 : 20)) } }
    const { container } = render(<WeatherCard />)
    expect(container.textContent).not.toMatch(/till d/)
    expect(container.textContent).toMatch(/More rain likely from 3 PM/)
    vi.useRealTimers()
  })
  describe('sun and heat tips at 10 AM place time (fake Date, so the tests cannot pass at night)', () => {
    const model = { value: true, source: 'model' as const, ageMin: null }
    const setup = (extra: Partial<Wx>) => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T02:00:00Z')) // 10:00 in Manila (UTC+8), before 15:00
      m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: true }
      m.wx = { ...base, temp: 31, humidity: 70, words: 'partly cloudy', code: 2, uvMax: 10, precip: 1.2, ...extra }
    }
    afterEach(() => vi.useRealTimers())
    it('control, not raining: the strong-sun tip shows when nothing outranks it', () => {
      setup({ humidity: null })
      render(<WeatherCard />)
      expect(screen.getByText(/Strong sun/)).toBeTruthy()
    })
    it('raining: no strong-sun tip', () => {
      setup({ humidity: null, rainingNow: model })
      const { container } = render(<WeatherCard />)
      expect(container.textContent).not.toMatch(/Strong sun/)
    })
    it('control, not raining: the Extreme caution heat line shows', () => {
      setup({})
      render(<WeatherCard />)
      expect(screen.getByText('Avoid the noon sun. Drink water often.')).toBeTruthy()
    })
    it('raining: no "Avoid the noon sun" line', () => {
      setup({ rainingNow: model })
      const { container } = render(<WeatherCard />)
      expect(container.textContent).not.toMatch(/noon sun/)
    })
    it('raining but Danger heat index: the Danger line stays', () => {
      setup({ temp: 34, rainingNow: model })
      render(<WeatherCard />)
      expect(screen.getByText(/^Stay indoors/)).toBeTruthy()
    })
    it('raining: the Now cell of the hourly strip has the rain icon, not a cloud', () => {
      setup({ rainingNow: model })
      const t0 = '2026-10-20T10:00'
      ;(m.wx as Wx).hourly = { time: [t0, '2026-10-20T11:00'], prob: [20, 20], code: [3, 3], temp: [31, 31] }
      expect(hourlySlots(m.wx as Wx, new Date())[0]).toMatchObject({ time: 'Now', kind: 'rain' })
      ;(m.wx as Wx).rainingNow = null
      expect(hourlySlots(m.wx as Wx, new Date())[0]).toMatchObject({ time: 'Now', kind: 'cloud' })
    })
  })
  it('no fix and no picked zone: the place once, as the one Location off note', () => {
    m.place = { weather: { lat: 9.645705, lon: 123.877951 }, zone: 'dampas', source: 'zone', settled: true, picked: false }
    m.wx = base
    const { container } = render(<WeatherCard expanded />)
    expect(container.textContent).not.toContain('your home area')
    expect(screen.getByTestId('location-off').textContent).toBe('Location off: showing Dampas, Tagbilaran')
    expect(screen.getByTestId('forecast-note').textContent).toBe('Weather data by Open-Meteo.com')
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
    expect(screen.getByText(/^Dampas, Tagbilaran · as of\s/)).toBeTruthy()
    expect(container.querySelector('.td-wxh-t')!.textContent).toBe('33°')
    expect(screen.getByText('Partly cloudy')).toBeTruthy()
    expect(screen.getByText('Feels 43°')).toBeTruthy()
    expect(screen.getByText('Danger')).toBeTruthy()
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
