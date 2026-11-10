// @vitest-environment node
// S29 B: "raining now" from airport METAR present weather, then Open-Meteo current; and the hourly chance as a share of sources.
// Expected values are worked out by hand: METAR groups follow ICAO Annex 3 (RA rain, DZ drizzle, SH showers, TS thunderstorm, - light, + heavy, VC in the vicinity).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blend, type Hour, modelRaining, type Series } from './blend.ts'
import { nearestStation, parseRainObs, rainObserved } from './metar.ts'

const NOW = Date.parse('2026-11-10T04:00:00Z')
const obs = (wx: string, minAgo = 20) => [{ icaoId: 'RPMR', obsTime: (NOW - minAgo * 60_000) / 1000, wxString: wx, rawOb: `METAR RPMR 100330Z 09005KT 9999 ${wx} FEW018 28/25 Q1010` }]
const GENSAN = { lat: 6.11, lon: 125.17 } // about 9 km from RPMR

describe('METAR present weather', () => {
  it.each([['RA', true], ['-SHRA', true], ['VCSH', true], ['TSRA', true], ['+RA', true], ['DZ', true], ['TS', true], ['-RA BR', true], ['BR', false], ['HZ', false], ['', false], ['RERA', false]])('"%s" -> wet %s', (wx, wet) => {
    expect(parseRainObs(obs(wx), NOW)?.wet).toBe(wet)
  })
  it('falls back to the raw report when there is no wxString, and ignores remarks', () => {
    const raw = [{ obsTime: NOW / 1000, rawOb: 'METAR RPMR 100400Z 09005KT 9999 -RA FEW018 28/25 Q1010 RMK SHRA' }]
    expect(parseRainObs(raw, NOW)?.wet).toBe(true)
    const dry = [{ obsTime: NOW / 1000, rawOb: 'METAR RPMR 100400Z 09005KT 9999 FEW018 28/25 Q1010 RMK SHRA' }]
    expect(parseRainObs(dry, NOW)?.wet).toBe(false)
  })
  it('trend groups (TEMPO, BECMG) are a forecast, not rain now', () => {
    const tempo = [{ obsTime: NOW / 1000, rawOb: 'METAR RPMR 100400Z 09005KT 9999 FEW018 28/25 Q1010 TEMPO -SHRA' }]
    expect(parseRainObs(tempo, NOW)?.wet).toBe(false)
    const becmg = [{ obsTime: NOW / 1000, rawOb: 'METAR RPMR 100400Z 09005KT 9999 FEW018 28/25 Q1010 BECMG TSRA' }]
    expect(parseRainObs(becmg, NOW)?.wet).toBe(false)
    const wetNow = [{ obsTime: NOW / 1000, rawOb: 'METAR RPMR 100400Z 09005KT 9999 -RA FEW018 28/25 Q1010 NOSIG' }]
    expect(parseRainObs(wetNow, NOW)?.wet).toBe(true)
  })
  it('a report older than 90 minutes, or none, is no answer (null, not dry)', () => {
    expect(parseRainObs(obs('RA', 90), NOW)).toMatchObject({ wet: true, ageMin: 90 })
    expect(parseRainObs(obs('RA', 91), NOW)).toBeNull()
    expect(parseRainObs([], NOW)).toBeNull()
    expect(parseRainObs(null, NOW)).toBeNull()
  })
})

describe('observed rain at the nearest station', () => {
  it('uses a station within 25 km, with its name and age', async () => {
    const r = await rainObserved(async () => obs('-SHRA', 15), GENSAN, NOW)
    expect(r).toEqual({ value: true, source: 'observed', ageMin: 15, station: 'General Santos airport' })
  })
  it('no station within 25 km: null (Manila)', async () => {
    expect(nearestStation({ lat: 14.6, lon: 121 }, 25)).toBeNull()
    expect(await rainObserved(async () => obs('RA'), { lat: 14.6, lon: 121 }, NOW)).toBeNull()
  })
  it('a station 30 km away is too far; 22 km is inside 25 km but outside the 20 km temperature check', () => {
    expect(nearestStation({ lat: 6.058, lon: 125.096 + 0.27 }, 25)).toBeNull() // 0.27 deg of longitude is 29.8 km at 6 N
    expect(nearestStation({ lat: 6.058, lon: 125.096 + 0.2 }, 25)?.id).toBe('RPMR') // 22.1 km
    expect(nearestStation({ lat: 6.058, lon: 125.096 + 0.2 })).toBeNull() // default 20 km
  })
  it('a failed fetch gives null so the model answer stands', async () => {
    expect(await rainObserved(async () => { throw new Error('HTTP500') }, GENSAN, NOW)).toBeNull()
  })
})

describe('model rain now', () => {
  it('more than 0.1 mm, or a rain/shower/storm code, is wet', () => {
    expect(modelRaining({ precip: 0.3, code: 3 })).toEqual({ value: true, source: 'model', ageMin: null })
    expect(modelRaining({ precip: 0.1, code: 3 })?.value).toBe(false) // exactly 0.1 is not more than 0.1
    expect(modelRaining({ precip: 0, code: 61 })?.value).toBe(true)
    expect(modelRaining({ precip: 0, code: 80 })?.value).toBe(true)
    expect(modelRaining({ precip: 0, code: 95 })?.value).toBe(true)
    expect(modelRaining({ precip: 0, code: 45 })?.value).toBe(false)
    expect(modelRaining({ precip: 0, code: 3 })?.value).toBe(false)
  })
  it('nothing known is null, never dry', () => {
    expect(modelRaining({ precip: null, code: null })).toBeNull()
    expect(modelRaining(null)).toBeNull()
  })
})

const gathered = (cur: Record<string, unknown>) => ({ series: [{ id: 'open-meteo' as const, now: { time: '2026-11-10T12:00', temp: 30, humidity: 70, feels: 34, wind: 5, gust: 9, uv: 8, precip: null, code: null, ...cur }, hours: [], days: [] }], sources: [], aqi: null })
const blended = (cur: Record<string, unknown>) => blend(gathered(cur), GENSAN, NOW)

describe('blend() sets the model rain now (contract rule B: METAR, then model, then null)', () => {
  it('wet: 0.4 mm now, or a rain code', () => {
    expect(blended({ precip: 0.4, code: 3 }).rainingNow).toEqual({ value: true, source: 'model', ageMin: null })
    expect(blended({ precip: null, code: 63 }).rainingNow?.value).toBe(true)
  })
  it('dry: 0 mm and a cloud code', () => expect(blended({ precip: 0, code: 3 }).rainingNow).toEqual({ value: false, source: 'model', ageMin: null }))
  it('unknown: no precip and no code is null, never dry', () => expect(blended({ precip: null, code: null }).rainingNow).toBeNull())
  it('contract rule B: only Open-Meteo counts. MET rain code with Open-Meteo dry is dry; Open-Meteo missing is null', () => {
    const mk = (id: 'open-meteo' | 'met-norway', precip: number | null, code: number | null): Series => ({ id, now: { time: '2026-11-10T12:00', temp: 30, humidity: 70, feels: 34, wind: 5, gust: 9, uv: 8, precip, code }, hours: [], days: [] })
    const run = (series: Series[]) => blend({ series, sources: [], aqi: null }, GENSAN, NOW).rainingNow
    expect(run([mk('open-meteo', 0, 3), mk('met-norway', 2, 63)])).toEqual({ value: false, source: 'model', ageMin: null })
    expect(run([mk('met-norway', 2, 63)])).toBeNull()
  })
  it('index.ts order: no METAR near (Manila) keeps the model value; a fresh dry METAR beats a wet model', async () => {
    const wet = blended({ precip: 2, code: 63 })
    const manila = await rainObserved(async () => obs('RA'), { lat: 14.6, lon: 121 }, NOW)
    expect(manila ?? wet.rainingNow).toEqual({ value: true, source: 'model', ageMin: null })
    const dry = await rainObserved(async () => obs('', 10), GENSAN, NOW)
    expect(dry ?? wet.rainingNow).toEqual({ value: false, source: 'observed', ageMin: 10, station: 'General Santos airport' })
  })
  it('index.ts really uses that order and fetches each METAR once', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(src).toContain('b.rainingNow = (await rainP) ?? b.rainingNow')
    expect(src).toContain('const rainP = rainObserved(fetchJson, cell, now)') // started before gather(), so the airport report never waits for the providers
    expect(src).toContain('memoJson(')
  })
})

const hour = (rain: number | null, prob: number | null): Hour => ({ time: '2026-11-10T12:00', temp: 30, prob, code: 2, rain })
const ser = (id: Series['id'], h: Hour): Series => ({ id, now: null, hours: [h], days: [] })
const chanceOf = (hs: Hour[]) => blend({ series: hs.map((h, i) => ser((['open-meteo', 'met-norway', 'openweather'] as const)[i]!, h)), sources: [], aqi: null }, { lat: 6.11, lon: 125.17 }, NOW).hourly48.find((h) => h.time === '2026-11-10T12:00')?.prob

describe('hourly chance = share of wet sources', () => {
  it('three sources, one wet -> 33; two wet -> 67; all wet -> 100; none -> 0', () => {
    expect(chanceOf([hour(0.2, 10), hour(0, 10), hour(0, 10)])).toBe(33)
    expect(chanceOf([hour(0.2, 10), hour(1, 10), hour(0, 10)])).toBe(67)
    expect(chanceOf([hour(0.2, 90), hour(1, 90), hour(3, 90)])).toBe(100)
    expect(chanceOf([hour(0, 90), hour(0.05, 90), hour(0, 90)])).toBe(0) // 0.05 mm is under 0.1
  })
  it('two sources, one wet -> 50', () => expect(chanceOf([hour(0.1, 20), hour(0, 20)])).toBe(50))
  it('one source (or one with millimetres) keeps the model probability', () => {
    expect(chanceOf([hour(0, 40)])).toBe(40)
    expect(chanceOf([hour(0.5, 40), hour(null, 80)])).toBe(60) // only one reports mm: the median of 40 and 80
  })
})
