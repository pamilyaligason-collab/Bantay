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
