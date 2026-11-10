// S29 B: the labels. A rain chance under 10% never reads "0%"; the chip says where "raining now" comes from; no fix says so.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HourlyStrip from '../today/HourlyStrip'
import RainMini from '../today/RainMini'
import { parseForecast, forecastUrl } from './forecast'
import RainNowChip from './RainNowChip'
import { locationOffNote, rainChanceText, reconcileNow } from './rainNow'

afterEach(cleanup)

describe('rain chance words', () => {
  it('under 10% is Low chance, 10% and up is the number, unknown stays unknown', () => {
    expect(rainChanceText(0)).toBe('Low chance')
    expect(rainChanceText(9)).toBe('Low chance')
    expect(rainChanceText(9.4)).toBe('Low chance')
    expect(rainChanceText(10)).toBe('10%')
    expect(rainChanceText(66.6)).toBe('67%')
    expect(rainChanceText(null)).toBeNull()
  })
  it('the hourly strip never prints 0%', () => {
    render(<HourlyStrip slots={[{ time: 'Now', kind: 'cloud', pct: 0, temp: 30 }, { time: '1 PM', kind: 'rain', pct: 40, temp: 29 }]} />)
    expect(screen.getByText('Low chance')).toBeTruthy()
    expect(screen.getByText('40% rain')).toBeTruthy()
    expect(screen.queryByText(/^0%/)).toBeNull()
  })
})

describe('Raining now chip', () => {
  it('observed names the station', () => {
    render(<RainNowChip rain={{ value: true, source: 'observed', ageMin: 12, station: 'General Santos airport' }} />)
    expect(screen.getByTestId('rain-now').textContent).toBe('Raining now · observed at General Santos airport')
  })
  it('model says model; dry and unknown show nothing', () => {
    const { rerender } = render(<RainNowChip rain={{ value: true, source: 'model', ageMin: null }} />)
    expect(screen.getByTestId('rain-now').textContent).toBe('Raining now · model')
    rerender(<RainNowChip rain={{ value: false, source: 'observed', ageMin: 5, station: 'X' }} />)
    expect(screen.queryByTestId('rain-now')).toBeNull()
    rerender(<RainNowChip rain={null} />)
    expect(screen.queryByTestId('rain-now')).toBeNull()
  })
})

describe('rain bars while it rains', () => {
  it('says so instead of "No rain" when the forecast shows none', () => {
    const dry = Array.from({ length: 8 }, (_, i) => ({ time: `2026-11-10T12:${String(i * 15 % 60).padStart(2, '0')}`, mm: 0, pct: null, wet: false }))
    render(<RainMini slots={dry} raining />)
    expect(screen.getByTestId('rain-mini').textContent).toMatch(/raining now/)
  })
})

describe('reconcileNow: one story for the card', () => {
  const model = { value: true, source: 'model' as const, ageMin: null }
  const dryObs = { value: false, source: 'observed' as const, ageMin: 10, station: 'X' }
  it('raining with a cloud code and 3 mm: Rain, rain icon, no sun tip', () => {
    expect(reconcileNow({ words: 'partly cloudy', code: 2, precip: 3, rainingNow: model })).toEqual({ words: 'rain', code: 63, hideSun: true })
  })
  it('raining with under 2.5 mm: Light rain; precip unknown: Rain', () => {
    expect(reconcileNow({ words: 'cloudy', code: 3, precip: 0.4, rainingNow: model })).toEqual({ words: 'light rain', code: 61, hideSun: true })
    expect(reconcileNow({ words: 'cloudy', code: 3, precip: null, rainingNow: model })).toEqual({ words: 'rain', code: 63, hideSun: true })
  })
  it('raining and the code already says rain or storm: keep it, still hide the sun tip', () => {
    expect(reconcileNow({ words: 'heavy rain', code: 65, precip: 9, rainingNow: model })).toEqual({ words: 'heavy rain', code: 65, hideSun: true })
    expect(reconcileNow({ words: 'thunderstorm', code: 95, rainingNow: model }).code).toBe(95)
  })
  it('observed dry beats a rain code: no rain words or icon', () => {
    expect(reconcileNow({ words: 'rain', code: 63, rainingNow: dryObs })).toEqual({ words: 'cloudy', code: 3, hideSun: false })
  })
  it('unknown, or a model dry reading, changes nothing', () => {
    expect(reconcileNow({ words: 'clear', code: 0, rainingNow: null })).toEqual({ words: 'clear', code: 0, hideSun: false })
    expect(reconcileNow({ words: 'rain', code: 63, rainingNow: { ...model, value: false } })).toEqual({ words: 'rain', code: 63, hideSun: false })
    expect(reconcileNow({ words: 'unsettled', rainingNow: undefined })).toEqual({ words: 'unsettled', code: null, hideSun: false })
  })
})

describe('no location fix', () => {
  it('names the home place it is showing; a picked zone or a real fix says nothing', () => {
    expect(locationOffNote({ source: 'zone', zone: 'dampas', picked: false, settled: true })).toBe('Location off: showing Dampas, Tagbilaran')
    expect(locationOffNote({ source: 'zone', zone: 'dampas', picked: true, settled: true })).toBeNull()
    expect(locationOffNote({ source: 'gps', zone: 'dampas', picked: false, settled: true })).toBeNull()
    expect(locationOffNote({ source: 'zone', zone: 'dampas', picked: false, settled: false })).toBeNull() // still looking
    expect(locationOffNote(null)).toBeNull()
  })
})

describe('direct forecast asks for rain now', () => {
  it('requests current precipitation and rain', () => {
    const q = new URL(forecastUrl({ lat: 6.11, lon: 125.17 })).searchParams.get('current')!.split(',')
    expect(q).toEqual(expect.arrayContaining(['precipitation', 'rain', 'weather_code']))
  })
  it('model rain now from current precipitation or the code; unknown stays null', () => {
    const f = (cur: Record<string, unknown>) => parseForecast({ current: { time: '2026-11-10T12:00', temperature_2m: 30, ...cur }, hourly: { time: [] } }, '2026-11-10T04:00:00Z')!.rainingNow
    expect(f({ precipitation: 0.4, weather_code: 3 })).toEqual({ value: true, source: 'model', ageMin: null })
    expect(f({ precipitation: 0, weather_code: 63 })?.value).toBe(true)
    expect(f({ precipitation: 0, weather_code: 2 })?.value).toBe(false)
    expect(f({})).toBeNull()
  })
})
