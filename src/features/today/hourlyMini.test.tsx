import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Wx } from './heroCards'
import { kindOf } from '../weather/forecast'
import { hourlySlots } from './HourlyStrip'
import { miniSlots, miniSummary } from './RainMini'
import WeatherCard from './WeatherCard'

const m = vi.hoisted(() => ({ place: { weather: { lat: 9.6, lon: 123.8 }, zone: 'dampas', source: 'zone', settled: true, picked: false } as unknown, wx: null as unknown }))
vi.mock('../weather/weatherPlace', () => ({ useWeatherPlace: () => ({ place: m.place, point: (m.place as { weather?: unknown } | null)?.weather ?? null }) }))
vi.mock('../safety/store', () => ({ useKv: () => [] }))
vi.mock('./weather', () => ({ useWeather: () => m.wx }))
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:20:00Z')) }) // 8:20 PM at the place (UTC+8)
afterEach(() => { cleanup(); vi.useRealTimers() })

const NOW = new Date('2026-10-20T12:20:00Z')
const time = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 9, 20, 18 + i)).toISOString().slice(0, 16)) // place-local 18:00 today, then hourly
const mk = (prob: (number | null)[], code = 63): Wx => ({
  temp: 26, rainPct: 80, words: 'partly cloudy', at: '2026-10-20T12:00:00Z', code: 2, humidity: 60, utcOffset: 8 * 3600, tz: 'Asia/Manila', high: 30, low: 24,
  hourly: { time, prob, code: time.map(() => code), temp: time.map((_, i) => 20 + i) }
})
// 18:00..: 8 PM is index 2. 8 PM 10%, 9 PM 80%, 10 PM 80%, rest 10%.
const wet = time.map((_, i) => (i === 3 || i === 4 ? 80 : 10))

describe('hourly strip data', () => {
  it('shows 12 hours, current hour first, in order', () => {
    const s = hourlySlots(mk(wet), NOW)
    expect(s).toHaveLength(12)
    expect(s.map((x) => x.time).slice(0, 4)).toEqual(['Now', '9 PM', '10 PM', '11 PM'])
    expect(s[0]!.temp).toBe(26) // now = the big temperature
    expect(s[1]!.temp).toBe(23) // hourly index 3 is 20 + 3
    expect(s[11]!.time).toBe('7 AM')
  })
  it('S29: the Now cell shows rain while raining now, even when the current code is already wet and the hourly code is a cloud', () => {
    const wx = { ...mk(wet, 3), code: 61, words: 'light rain', rainingNow: { value: true, source: 'model' as const, ageMin: null } }
    const s = hourlySlots(wx, NOW)
    expect(s[0]!.kind).toBe(kindOf(61))
    expect(s[0]!.kind).not.toBe(kindOf(3))
    expect(s[1]!.kind).toBe(kindOf(3)) // later hours keep their own code
  })
  it('null data shows nothing invented', () => {
    expect(hourlySlots({ ...mk(wet), hourly: undefined }, NOW)).toEqual([])
    const s = hourlySlots(mk(time.map(() => null)), NOW)
    expect(s.every((x) => x.pct === null)).toBe(true)
  })
  it('a storm floors every item at 60% with the storm icon', () => {
    const s = hourlySlots(mk(time.map(() => 10), 3), NOW, true)
    expect(s.every((x) => x.kind === 'storm' && x.pct === 60)).toBe(true)
  })
})

const mmOf = (m: (number | null)[]) => ({ ...mk(time.map(() => 80), 2), hourly: { ...mk(time.map(() => 80), 2).hourly!, mm: m } })
const cloudyMm = (idx: Record<number, number>) => time.map((_, i) => idx[i] ?? 0) // 80% chance, code 2 (partly cloudy) every hour

describe('mini rain estimate', () => {
  it('real mm: cloudy code 2 at 80% with 0.4 mm only in the 9 PM hour (hand-computed, linear between hour midpoints, mm/h / 4)', () => {
    const s = miniSlots(mmOf(cloudyMm({ 3: 0.4 })), NOW)!
    expect(s).toHaveLength(8)
    expect(s[0]!.time).toBe('2026-10-20T20:20') // starts now, not the quarter hour before
    expect(s.map((x) => x.mm)).toEqual([0, 0.02, 0.05, 0.07, 0.1, 0.08, 0.05, 0.03])
    expect(s.map((x) => x.wet)).toEqual([false, true, true, true, true, true, true, true])
    expect(s.every((x) => x.pct === null)).toBe(true)
    expect(miniSummary(s)).toBe('Next 2 hours: rain from about 8:35 PM, heaviest around 9:20 PM (about 0.1 mm in 15 minutes)')
  })
  it('cloudy at 80% with 0 mm every hour: dry, never "Rain likely" with flat bars', () => {
    const s = miniSlots(mmOf(cloudyMm({})), NOW)!
    expect(s.every((x) => x.mm === 0 && !x.wet)).toBe(true)
    expect(miniSummary(s)).toBeNull()
  })
  it('past-time guard: the heaviest slot is the first one, named 8:20 PM (now), never 8:15', () => {
    const s = miniSlots(mmOf(cloudyMm({ 2: 2 })), NOW)!
    expect(s[0]!.mm).toBe(0.48) // 2 mm/h x 57.5/60 of the way from 19:30 to 20:30, / 4
    expect(s[1]!.mm).toBe(0.4)
    expect(miniSummary(s)).toBe('Next 2 hours: rain now, heaviest around 8:20 PM (about 0.48 mm in 15 minutes)')
    expect(s.every((x) => x.time >= '2026-10-20T20:20')).toBe(true)
  })
  it('null precipitation (old cache): the chance per 15 minutes, no mm anywhere', () => {
    const s = miniSlots(mk(wet), NOW)!
    expect(s.map((x) => x.pct)).toEqual([10, 25, 42, 60, 77, 80, 80, 80]) // 10 + 70 x fraction between 20:30 and 21:30, rounded
    expect(s.map((x) => x.wet)).toEqual([false, false, true, true, true, true, true, true])
    expect(s.every((x) => x.mm === null)).toBe(true)
    expect(miniSummary(s)).toBe('Next 2 hours: rain likely from about 8:50 PM, most likely around 9:35 PM (80% chance)')
  })
  it('storm: the chance (floored at 60%) is used even when real mm are all zero', () => {
    const s = miniSlots(mmOf(cloudyMm({})), NOW, true)!
    expect(s.every((x) => x.wet && x.pct === 80 && x.mm === null)).toBe(true)
    expect(miniSummary(s)).toBe('Next 2 hours: rain likely now, most likely around 8:20 PM (80% chance)')
  })
  it('no numbers at all: null, never read as dry', () => {
    expect(miniSlots(mk(time.map(() => null)), NOW)).toBeNull()
    expect(miniSlots({ ...mk(wet), hourly: undefined }, NOW)).toBeNull()
  })
  it('a null mm hour is skipped, not read as 0', () => {
    const s = miniSlots(mmOf(time.map((_, i) => (i === 3 ? 0.4 : null))), NOW)!
    expect(s.every((x) => x.mm === 0.1)).toBe(true) // one point only: flat at 0.4 / 4
  })
})

describe('on the hero', () => {
  it('rain with real mm: bars with the mm on the tallest bar as text, the accessible summary and the estimated label; the strip is focusable with 12 items', () => {
    m.wx = mmOf(cloudyMm({ 3: 0.4 }))
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText('0.1 mm')).toBeTruthy()
    expect(screen.getByText(/^Next 2 hours: rain from about 8:35 PM/)).toBeTruthy()
    expect(screen.getByText('Estimated from hourly data')).toBeTruthy()
    expect(container.querySelectorAll('.td-rm-bars li')).toHaveLength(8)
    const strip = screen.getByTestId('hourly-strip')
    expect(strip.getAttribute('tabindex')).toBe('0')
    expect(strip.querySelectorAll('li')).toHaveLength(12)
    expect(screen.getByRole('link', { name: /Full forecast/ })).toBeTruthy()
  })
  it('no mm in the forecast: bars are the chance, labelled Chance of rain, with no mm', () => {
    m.wx = mk(wet)
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText('Chance of rain')).toBeTruthy()
    expect(container.querySelector('.td-rm-v')!.parentElement!.textContent).not.toContain('mm')
    expect(container.querySelector('.td-rm')!.textContent).not.toMatch(/ mm/)
    expect(screen.queryByText('Estimated from hourly data')).toBeNull()
  })
  it('80% chance but 0 mm: one plain dry line, no bars', () => {
    m.wx = mmOf(cloudyMm({}))
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText('No rain in the next 2 hours')).toBeTruthy()
    expect(container.querySelector('.td-rm-bars')).toBeNull()
  })
  it('no rain in the next 2 hours: one plain line, no bars', () => {
    m.wx = mk(time.map(() => 5))
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText('No rain in the next 2 hours')).toBeTruthy()
    expect(container.querySelector('.td-rm-bars')).toBeNull()
  })
  it('no hourly data: no strip and no estimate', () => {
    m.wx = { ...mk(wet), hourly: undefined }
    render(<WeatherCard expanded />)
    expect(screen.queryByTestId('hourly-strip')).toBeNull()
    expect(screen.queryByTestId('rain-mini')).toBeNull()
  })
  it('storm: the estimate agrees with the title and the strip (rain, not dry)', () => {
    m.wx = mk(time.map(() => 10), 3)
    render(<WeatherCard expanded storm />)
    expect(screen.getByText('Rain and strong wind.')).toBeTruthy()
    expect(screen.getByText(/^Next 2 hours: rain likely now/)).toBeTruthy()
    expect(screen.queryByText('No rain in the next 2 hours')).toBeNull()
  })
  it('compact keeps its 3 slots and draws neither the strip nor the estimate', () => {
    m.wx = mk(wet)
    const { container } = render(<WeatherCard />)
    expect(container.querySelectorAll('.td-wxh-hrs li')).toHaveLength(3)
    expect(screen.queryByTestId('hourly-strip')).toBeNull()
    expect(screen.queryByTestId('rain-mini')).toBeNull()
  })
  it('reduced motion: the grow animation is switched off in CSS', () => {
    const css = readFileSync('src/features/today/weatherHero.css', 'utf8')
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.td-rm-bars i \{ animation: none; \} \}/)
  })
})
