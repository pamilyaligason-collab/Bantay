// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildUnits, plain, simplify } from '../../../scripts/local-data/units.mjs'
import { unitAt } from './unitAt'

const ring = (a: number, b: number) => [[a, a], [b, a], [b, b], [a, b], [a, a]]
const shape = (name: string, coords: number[][][]) => ({ type: 'Feature', properties: { shapeName: name }, geometry: { type: 'Polygon', coordinates: coords } })

describe('units.mjs', () => {
  it('matches names the way PSGC writes them', () => {
    expect(plain('City of General Santos')).toBe(plain('General Santos City'))
    expect(plain('Cotabato (South)')).toBe('cotabato south') // never folded into "Cotabato": a name that does not match is listed for a person
    expect(plain('Zamboanga City')).toBe('zamboanga')
  })
  it('a province and a city that fold to one name are matched exactly, never merged', () => {
    const gj = { features: [shape('Cebu', [ring(0, 10)]), shape('City of Cebu', [ring(4, 6)])] }
    const r = buildUnits(gj, [{ code: 'P', name: 'Cebu' }, { code: 'C', name: 'City of Cebu' }], 'x')
    expect(r.file.units.map((u) => [u.code, u.bbox[2]]).sort()).toEqual([['C', 6], ['P', 10]])
    expect(buildUnits({ features: [shape('Cebu City', [ring(4, 6)])] }, [{ code: 'P', name: 'Cebu' }, { code: 'C', name: 'City of Cebu' }], 'x').noUnit).toEqual(['Cebu City']) // ambiguous fold: listed for a person
  })
  it('simplify drops points on a straight line and keeps the corners', () => {
    const line = [[0, 0], [1, 0.0001], [2, 0], [2, 2], [0, 2], [0, 0]]
    expect(simplify(line, 0.01)).toEqual([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])
  })
  it('builds a file that unitAt can use, records the sha and lists what did not match', () => {
    const gj = { features: [shape('Invented Province', [ring(0, 10)]), shape('Invented City', [ring(4, 6)]), shape('Stray Shape', [ring(20, 21)])] }
    const r = buildUnits(gj, [{ code: 'P1', name: 'Invented Province' }, { code: 'C1', name: 'City of Invented' }, { code: 'X9', name: 'Lonely Unit' }], 'abc123')
    expect(r.file).toMatchObject({ format: 1, sha256: 'abc123' })
    expect(r.noUnit).toEqual(['Stray Shape'])
    expect(r.noShape).toEqual(['Lonely Unit'])
    expect(r.file.units.find((u) => u.code === 'P1')!.bbox).toEqual([0, 0, 10, 10])
    expect(unitAt({ lat: 5, lon: 5 }, r.file.units)).toBe('C1')
    expect(unitAt({ lat: 1, lon: 1 }, r.file.units)).toBe('P1')
  })
})

describe('units.mjs NCR aliases', () => {
  it('files the four district shapes under one unit and Compostela Valley under Davao de Oro', () => {
    const gj = { features: [shape('NCR, City of Manila, First District', [ring(0, 1)]), shape('NCR, Second District', [ring(2, 3)]), shape('NCR, Fourth District', [ring(4, 5)]), shape('Compostela Valley', [ring(8, 9)])] }
    const r = buildUnits(gj, [{ code: 'M', name: 'City of Manila' }, { code: 'D', name: 'Davao de Oro' }], 'x')
    expect(r.noUnit).toEqual([])
    const m = r.file.units.find((u) => u.code === 'M')!
    expect(m.polys).toHaveLength(3)
    expect(m.bbox).toEqual([0, 0, 5, 5])
    expect(r.file.units.find((u) => u.code === 'D')!.bbox).toEqual([8, 8, 9, 9])
  })
})

describe('units.mjs ADM3 fill (S23 F)', () => {
  const adm2 = { features: [shape('Cebu', [ring(0, 10)]), shape('Maguindanao', [ring(20, 30)])] }
  const units = [{ code: 'P', name: 'Cebu' }, { code: 'C', name: 'City of Cebu' }, { code: 'B', name: 'City of Bacolod' }, { code: 'N', name: 'Maguindanao del Norte' }, { code: 'X', name: 'City of Nowhere' }]
  const lgus = [{ province_code: 'N', name: 'Datu Odin Sinsuat', kind: 'municipality' }, { province_code: 'N', name: 'Parang', kind: 'municipality' }]
  const adm3 = { features: [shape('Cebu City', [ring(4, 6)]), shape('Bacolod', [ring(50, 51)]), shape('Bacolod City', [ring(60, 61)]), shape('Datu Odin Sinsuat', [ring(21, 22)]), shape('Parang', [ring(23, 24)]), shape('Parang', [ring(80, 81)])] }
  const r = buildUnits(adm2, units, 'x', 0.004, adm3, lgus)
  it('a city with no ADM2 shape takes the ADM3 feature named "<name> City", never a bare same-name town', () => {
    expect(r.file.units.find((u) => u.code === 'C')!.bbox).toEqual([4, 4, 6, 6])
    expect(r.file.units.find((u) => u.code === 'B')!.bbox).toEqual([60, 60, 61, 61])
  })
  it('a province split out of an ADM2 shape is the union of its municipalities found inside that shape', () => {
    expect(r.file.units.find((u) => u.code === 'N')!.bbox).toEqual([21, 21, 24, 24])
  })
  it('a unit with no outline anywhere is still listed', () => {
    expect(r.noShape).toEqual(['City of Nowhere'])
  })
})

describe('units.mjs nesting and city checks (S23 F fix round)', () => {
  it('a city inside a province gets parent; a province overlapping a province never does', () => {
    const gj = { features: [shape('Cebu', [ring(0, 10)]), shape('Bohol', [ring(8, 20)]), shape('City of Cebu', [ring(4, 6)])] }
    const r = buildUnits(gj, [{ code: 'P', name: 'Cebu' }, { code: 'B', name: 'Bohol' }, { code: 'C', name: 'City of Cebu' }], 'x')
    expect(r.file.units.map((u) => [u.code, u.parent]).sort()).toEqual([['B', undefined], ['C', 'P'], ['P', undefined]])
  })
  it('lists a PSGC city whose shape lies outside its PSGC province (City of Cotabato) and one with no feature, not one inside', () => {
    const adm2 = { features: [shape('Maguindanao del Norte', [ring(0, 10)]), shape('Cotabato', [ring(20, 30)])] }
    const units = [{ code: 'N', name: 'Maguindanao del Norte' }, { code: 'K', name: 'Cotabato' }]
    const lgus = [
      { psgc_code: 'L1', province_code: 'N', name: 'City of Cotabato', kind: 'city' }, { psgc_code: 'L2', province_code: 'N', name: 'City of Inside', kind: 'city' },
      { psgc_code: 'L3', province_code: 'N', name: 'City of Nowhere', kind: 'city' }, { psgc_code: 'L4', province_code: '1380600000', name: 'City of Makati', kind: 'city' },
      { psgc_code: 'M1', province_code: 'N', name: 'Parang', kind: 'municipality' }
    ]
    const adm3 = { features: [shape('Cotabato City', [ring(24, 26)]), shape('City of Inside', [ring(4, 6)]), shape('Parang', [ring(2, 3)])] }
    const r = buildUnits(adm2, units, 'x', 0.004, adm3, lgus)
    expect(r.cityGaps).toEqual({ outside: ['L1 City of Cotabato'], unmatched: ['L3 City of Nowhere'] })
  })
})
