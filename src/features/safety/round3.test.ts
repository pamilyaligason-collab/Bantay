import { describe, expect, it } from 'vitest'
import type { Alert } from './alerts'
import { hazardLabel, hazardsFor } from './hazardCards'
import { stormLine } from './LiveMaps'
import { isNoise } from './news'
import { rainLine } from './SafetyHub'

const storm = (lat: number | null, lon: number | null): Alert => ({ id: 'gdacs-TC-1', kind: 'gdacs', level: 'Green', title: 'Tropical Cyclone MARIE', what: '', where: 'Pacific Ocean', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: '2026-10-18T00:00:00Z', lat, lon, bulletin: '' })
const bohol = { lat: 9.65, lon: 123.85 }

describe('stormLine', () => {
  it('says no storms only when none is listed', () => {
    expect(stormLine([], bohol, 'Dampas').text).toMatch(/^No storm warnings for the Philippines from GDACS/)
  })
  it('far storm: distance, direction, not expected to reach', () => {
    const l = stormLine([storm(10, 135)], bohol, 'Dampas')
    expect(l.text).toMatch(/is about 1,[0-9]{3} km east of Dampas\. Far from land, not expected to reach Dampas soon/)
    expect(l.tone).toBe('calm')
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
    expect(rainLine({ temp: 28, rainPct: 86, words: 'cloudy', at: '' })).toBe('Chance of rain today: 86%.')
    expect(rainLine({ temp: 28, rainPct: null, words: 'cloudy', at: '' })).toBe('Rain, wind and clouds')
    expect(rainLine(null)).toBe('Rain, wind and clouds')
  })
  it('uses the same words as Today when hourly data says rain is coming', () => {
    const wx = { temp: 28, rainPct: 80, words: 'cloudy', at: '', hourly: { time: ['2026-10-19T13:00', '2026-10-19T14:00', '2026-10-19T15:00'], prob: [10, 80, 60] } }
    expect(rainLine(wx, new Date('2026-10-19T05:00:00Z'))).toMatch(/^Rain likely from 2 PM/)
  })
})
