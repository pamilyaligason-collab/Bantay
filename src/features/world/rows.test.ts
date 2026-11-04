import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { forecastRows, pinsOf, visible, volcanoRows, worldRows } from './rows'

const NOW = Date.parse('2026-11-01T06:00:00Z')
const base: Alert = { id: 'x', kind: 'tcws', level: 'Signal No. 2', title: 'T', what: '', where: '', when: '', doNow: '', source: 'PAGASA', sourceUrl: null, issuedAt: '2026-11-01T04:00:00Z', lat: null, lon: null, bulletin: '' }
const mk = (o: Partial<Alert>): Alert => ({ ...base, ...o })
const DAMPAS = { lat: 9.64, lon: 123.87 }

const near = mk({ id: 'near', kind: 'quake', level: 'M5.1', title: 'Quake near Bohol', source: 'USGS', lat: 9.7, lon: 123.9 })
const ph = mk({ id: 'ph', kind: 'rainfall', level: 'Orange', title: 'Rainfall Mindanao', lat: 7.1, lon: 125.6 })
const gPar = mk({ id: 'gpar', kind: 'gdacs', level: 'Orange', title: 'Orange tropical cyclone BAGYO', source: 'GDACS', lat: 14, lon: 127 })
const gFar = mk({ id: 'gfar', kind: 'gdacs', level: null, title: 'Flood in Chile', source: 'GDACS', lat: -33, lon: -70, issuedAt: '2026-11-01T05:00:00Z' })
const gOld = mk({ id: 'gold', kind: 'gdacs', level: 'Green', title: 'Quake Japan', source: 'GDACS', lat: 36, lon: 140, issuedAt: '2026-10-30T05:00:00Z' })

describe('worldRows', () => {
  const r = worldRows([near, ph, gPar, gFar, gOld], DAMPAS, NOW)
  it('splits near family, Philippines and world', () => {
    expect(r.nearFamily.map((x) => x.id)).toEqual(['near'])
    expect(r.philippines.map((x) => x.id).sort()).toEqual(['gpar', 'near', 'ph'])
    expect(r.world.map((x) => x.id)).toEqual(['gfar', 'gold'])
  })
  it('rows carry title, sub with source and age, and a badge', () => {
    const f = r.world[0]!
    expect(f).toMatchObject({ title: 'Flood in Chile', sub: 'GDACS · 1 h ago', badge: 'Advisory' })
    expect(r.nearFamily[0]!.badge).toBe('M5.1')
  })
  it('links cyclones to the storm tracker and the rest to warnings', () => {
    expect(r.philippines.find((x) => x.id === 'gpar')!.href).toBe('#safety/storms')
    expect(r.philippines.find((x) => x.id === 'ph')!.href).toBe('#safety/warnings')
  })
  it('is empty for no alerts', () => {
    expect(worldRows([], DAMPAS, NOW)).toEqual({ nearFamily: [], philippines: [], world: [] })
  })
})

describe('eonet', () => {
  const ev = (id: string, title: string, lat = 40, lon = 10) => mk({ id, kind: 'eonet' as Alert['kind'], level: null, title, source: 'NASA EONET', lat, lon })
  const volc = ev('e1', 'Volcano eruption, Example Island')
  const fire = ev('e2', 'Wildfire, Example Valley')
  const storm = ev('e3', 'Tropical cyclone Example')
  const flood = ev('e4', 'Flood, Example River')
  it('maps the EONET category to a pin kind: wildfire is other', () => {
    expect(pinsOf([volc, fire, storm, flood]).map((p) => [p.id, p.kind])).toEqual([['e1', 'volcano'], ['e2', 'other'], ['e3', 'storm'], ['e4', 'flood']])
  })
  it('an EONET event outside the Philippines sits under World, not Philippines', () => {
    const r = worldRows([volc], DAMPAS, NOW)
    expect(r.world.map((x) => x.id)).toEqual(['e1'])
    expect(r.philippines).toEqual([])
  })
  it('an EONET event inside the PAR box and next to a home zone is still never Official or Near family', () => {
    const close = mk({ id: 'e9', kind: 'eonet' as Alert['kind'], level: null, title: 'Wildfires: Storm Creek Fire', what: 'Wildfires: Storm Creek Fire', source: 'EONET', lat: 9.7, lon: 123.9 })
    const r = worldRows([close], DAMPAS, NOW)
    expect(r.nearFamily).toEqual([])
    expect(r.philippines).toEqual([])
    expect(r.world.map((x) => [x.id, x.badge])).toEqual([['e9', 'On the radar']])
    expect(pinsOf([close])[0]!.kind).toBe('other') // the category (Wildfires) decides, not the word Storm in the title
  })
  it('visible() drops EONET rows while the flag is off and keeps everything else', () => {
    expect(visible([volc, near], false).map((a) => a.id)).toEqual(['near'])
    expect(visible([volc, near], true).map((a) => a.id)).toEqual(['e1', 'near'])
  })
  it('forecastRows lists EONET events and GDACS storms, newest first', () => {
    const newer = ev('e5', 'Flood, Another River')
    newer.issuedAt = '2026-11-01T05:30:00Z'
    const mid = { ...volc, issuedAt: '2026-11-01T04:30:00Z' } // between the 05:30 event and the 04:00 cyclone
    expect(forecastRows([near, ph, gPar, mid, newer], NOW).map((x) => x.id)).toEqual(['e5', 'e1', 'gpar'])
  })
  it('volcanoRows lists volcano bulletins and EONET volcanoes only', () => {
    const bulletin = mk({ id: 'pv', kind: 'volcano', level: 'Level 2', title: 'Example volcano', source: 'PHIVOLCS', issuedAt: '2026-11-01T05:00:00Z' })
    expect(volcanoRows([near, fire, volc, bulletin], NOW).map((x) => x.id)).toEqual(['pv', 'e1'])
  })
})

describe('pinsOf', () => {
  it('keeps only rows with a point and colours them by kind', () => {
    const pins = pinsOf([near, ph, gPar, mk({ id: 'nopt' })])
    expect(pins.map((p) => [p.id, p.kind])).toEqual([['near', 'quake'], ['ph', 'flood'], ['gpar', 'storm']])
  })
})
