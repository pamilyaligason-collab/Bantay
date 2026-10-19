import { describe, expect, it } from 'vitest'
import type { Alert } from './alerts'
import { hazardLabel, hazardsFor } from './hazardCards'
import { stormLine } from './LiveMaps'
import { isNoise } from './news'
import { rainLine } from './SafetyHub'
import { short } from '../docs/DocsScreen'
import { heroCards } from '../today/heroCards'
import hotlines from '../../data/safety/hotlines.json'

const storm = (lat: number | null, lon: number | null): Alert => ({ id: 'gdacs-TC-1', kind: 'gdacs', level: 'Green', title: 'Tropical Cyclone MARIE', what: '', where: 'Pacific Ocean', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: '2026-10-18T00:00:00Z', lat, lon, bulletin: '' })
const bohol = { lat: 9.65, lon: 123.85 }

describe('stormLine', () => {
  it('says no storms only when none is listed', () => {
    expect(stormLine([], bohol, 'Dampas').text).toMatch(/^No storm warnings for the Philippines from GDACS/)
  })
  it('far storm: distance and direction only, no claim about land or where it goes', () => {
    const l = stormLine([storm(10, 135)], bohol, 'Dampas')
    expect(l.text).toMatch(/is about 1,[0-9]{3} km east of Dampas\. That is far from Dampas, but check PAGASA/)
    expect(l.text).not.toMatch(/Far from land|not expected/)
    expect(l.tone).toBe('calm')
  })
  it('a far storm over Philippine land (Batanes) is not called far from land', () => {
    expect(stormLine([storm(20.5, 122)], bohol, 'Dampas').text).not.toMatch(/from land|not expected/)
  })
  it('near storm never says it will not reach', () => {
    const l = stormLine([storm(11, 125)], bohol, 'Dampas')
    expect(l.text).not.toMatch(/not expected/)
    expect(l.tone).toBe('watch')
  })
  it('listed without a position: still admits the storm', () => {
    expect(stormLine([storm(null, null)], bohol, 'Dampas').text).toMatch(/position is not given/)
  })
})

describe('isNoise', () => {
  const n = (title: string, source = 'x') => ({ title, source })
  it('drops job vacancies, tourism, veterinary and bids', () => {
    for (const t of ['JOB VACANCIES at the city hall', 'Bohol tourism arrivals up', 'Provincial Veterinary Office vaccinates dogs', 'Invitation to bid for road works']) expect(isNoise(n(t))).toBe(true)
  })
  it('keeps PAGASA, PHIVOLCS and DOH advisories', () => {
    for (const t of ['PAGASA: Signal No. 2 raised over Bohol', 'PHIVOLCS reports magnitude 5.1 quake', 'DOH advisory on dengue']) expect(isNoise(n(t))).toBe(false)
  })
  it('keeps real advisories that mention tourists, livestock or vets', () => {
    for (const t of ['Tourists told to stay away from Kanlaon Volcano', 'PHIVOLCS: Taal tourists evacuated', 'Tourism office: boats suspended as Signal No. 1 raised', 'Livestock moved as floods rise in Loboc', 'DOH: rabies vaccine shortage advisory', 'Veterans hospital opens evacuation center', 'Velvet Road closed by landslide']) expect(isNoise(n(t))).toBe(false)
  })
  it('bare advisory/warning needs an official source; brainstorm is not a storm', () => {
    expect(isNoise(n('Travel advisory: Panglao travel guide'))).toBe(true)
    expect(isNoise(n('Tourist brainstorm session'))).toBe(true)
    expect(isNoise(n('PAGASA warning: Signal No. 1 for tourists in Bohol'))).toBe(false)
    expect(isNoise(n('Tourism warning issued', 'PHIVOLCS'))).toBe(false)
  })
  it('still drops bids and vacancies even from an official source', () => {
    expect(isNoise(n('DOH job vacancies 2026', 'DOH'))).toBe(true)
    expect(isNoise(n('Procurement notice: flood control supplies'))).toBe(true)
  })
})

describe('hazard single label', () => {
  it('a one reading card is labelled by that reading only', () => {
    const v = hazardsFor('dampas')!
    expect(hazardLabel(v.cards.find((c) => c.id === 'flood')!)).toBe('Not confirmed yet')
    expect(hazardLabel(v.cards.find((c) => c.id === 'landslide')!)).not.toMatch(/Lower risk|No reading/)
  })
  it('a many reading card gets one overall word', () => {
    expect(hazardLabel(hazardsFor('dampas')!.cards.find((c) => c.id === 'quake')!)).toBe('Take care')
  })
})

describe('rainLine', () => {
  it('falls back to the day chance with no hourly data, and never prints NaN', () => {
    expect(rainLine({ temp: 28, rainPct: 86, words: 'cloudy', at: '' })).toBe('Bring an umbrella. Chance of rain: 86%.')
    expect(rainLine({ temp: 28, rainPct: null, words: 'cloudy', at: '' })).toBe('No rain chance number yet.')
    expect(rainLine(null)).toBe('Rain, wind and clouds')
  })
  it('never raining in the window: same sentence as Today, not "no more rain"', () => {
    const wx = { temp: 30, rainPct: 40, words: 'sunny', at: '', hourly: { time: ['2026-10-19T16:00', '2026-10-19T17:00', '2026-10-19T18:00'], prob: [10, 10, 10] } }
    const now = new Date('2026-10-19T08:00:00Z')
    const today = heroCards({ alerts: [], ref: null, doses: [], weather: wx, placeName: 'Dampas', now }).find((c) => c.kind === 'weather')!
    expect(rainLine(wx, now)).toBe('Chance of rain today: 40%.')
    expect(rainLine(wx, now)).toBe(today.body)
  })
  it('rain gone from the window: "no more rain" only if the sky showed rain; rounds the percent', () => {
    const hourly = { time: ['2026-10-19T16:00', '2026-10-19T17:00'], prob: [10, 10] }
    const now = new Date('2026-10-19T08:00:00Z')
    const dry = { temp: 30, rainPct: 70.4, words: 'cloudy', at: '', hourly }
    expect(rainLine(dry, now)).toBe('Chance of rain today: 70%.')
    expect(heroCards({ alerts: [], ref: null, doses: [], weather: dry, placeName: 'D', now })[0]!.title).not.toMatch(/passed/)
    const wet = { temp: 26, rainPct: 70, words: 'rain showers', code: 61, at: '', hourly }
    expect(rainLine(wet, now)).toBe('No more rain expected for now.')
    expect(heroCards({ alerts: [], ref: null, doses: [], weather: wet, placeName: 'D', now })[0]!.title).toMatch(/passed/)
  })
  it('uses the same words as Today when hourly data says rain is coming', () => {
    const wx = { temp: 28, rainPct: 80, words: 'cloudy', at: '', hourly: { time: ['2026-10-19T13:00', '2026-10-19T14:00', '2026-10-19T15:00'], prob: [10, 80, 60] } }
    expect(rainLine(wx, new Date('2026-10-19T05:00:00Z'))).toMatch(/^Rain likely from 2 PM/)
  })
})

describe('docs chip name', () => {
  const P = (...n: string[]) => n.map((name) => ({ name }))
  it('first name; adds an initial for a shared first name; whole name when the initial is shared too; blank is not empty', () => {
    expect(short({ name: 'Maria Santos' }, P('Maria Santos', 'Jose Reyes'))).toBe('Maria')
    expect(short({ name: 'Maria Santos' }, P('Maria Santos', 'Maria Lopez'))).toBe('Maria S.')
    expect(short({ name: 'Maria Santos' }, P('Maria Santos', 'Maria Soriano'))).toBe('Maria Santos')
    expect(short({ name: '  ' }, P('  '))).toBe('Someone')
  })
})

describe('hotlines source text', () => {
  it('"Rechecked" starts a new sentence', () => {
    for (const h of hotlines as { source: string }[]) expect(h.source).not.toMatch(/[A-Za-z0-9] Rechecked/)
  })
})
