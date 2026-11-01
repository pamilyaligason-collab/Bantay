import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { pinsOf, worldRows } from './rows'

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

describe('pinsOf', () => {
  it('keeps only rows with a point and colours them by kind', () => {
    const pins = pinsOf([near, ph, gPar, mk({ id: 'nopt' })])
    expect(pins.map((p) => [p.id, p.kind])).toEqual([['near', 'quake'], ['ph', 'flood'], ['gpar', 'storm']])
  })
})
