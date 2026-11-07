import { describe, expect, it } from 'vitest'
import { claims, SWITCH_MS, type Unit, UnitTracker, unitAt } from './unitAt'

// Invented squares: the province is 0..10 with a lake hole 8..9 and a city hole 4..6; the city fills its hole.
const sq = (a: number, b: number) => [[a, a], [b, a], [b, b], [a, b], [a, a]]
const prov: Unit = { code: 'P', name: 'Province', bbox: [0, 0, 10, 10], polys: [[sq(0, 10), sq(4, 6), sq(8, 9)]] }
const city: Unit = { code: 'C', name: 'City', bbox: [4, 4, 6, 6], polys: [[sq(4, 6)]] }
const other: Unit = { code: 'O', name: 'Other', bbox: [20, 20, 30, 30], polys: [[sq(20, 30)]] }
const U = [prov, city, other]

describe('unitAt', () => {
  it('finds the unit that holds the point', () => {
    expect(unitAt({ lat: 1, lon: 2 }, U)).toBe('P')
    expect(unitAt({ lat: 25, lon: 25 }, U)).toBe('O')
  })
  it('the city wins inside its hole, whatever the list order', () => {
    expect(unitAt({ lat: 5, lon: 5 }, U)).toBe('C')
    expect(unitAt({ lat: 5, lon: 5 }, [city, prov])).toBe('C')
  })
  it('outside every unit, in a hole, or not a number gives null', () => {
    expect(unitAt({ lat: 15, lon: 15 }, U)).toBeNull()
    expect(unitAt({ lat: 8.5, lon: 8.5 }, U)).toBeNull()
    expect(unitAt({ lat: NaN, lon: 1 }, U)).toBeNull()
    expect(unitAt({ lat: 1, lon: 1 }, [])).toBeNull()
  })
})

describe('UnitTracker hysteresis', () => {
  it('takes the first fix at once', () => {
    expect(new UnitTracker().push('P', 0)).toBe('P')
  })
  it('a border flap never switches', () => {
    const t = new UnitTracker('P')
    expect(t.push('O', 0)).toBe('P')
    expect(t.push('P', 10_000)).toBe('P')
    expect(t.push('O', 20_000)).toBe('P')
    expect(t.push('O', 20_000 + SWITCH_MS - 1)).toBe('P')
  })
  it('two fixes in the new unit at least 2 minutes apart switch', () => {
    const t = new UnitTracker('P')
    t.push('O', 1000)
    expect(t.push('O', 1000 + SWITCH_MS)).toBe('O')
  })
  it('a fix at sea keeps the last unit and the pending switch', () => {
    const t = new UnitTracker('P')
    t.push('O', 0)
    expect(t.push(null, 50_000)).toBe('P')
    expect(t.push('O', SWITCH_MS)).toBe('O')
  })
})

describe('NCR (D-147)', () => {
  it('the committed outlines put a point inside Metro Manila in the unit that owns the NCR hazard pack', async () => {
    const { readFileSync } = await import('node:fs')
    const f = JSON.parse(readFileSync('public/geo/units.json', 'utf8'))
    expect(unitAt({ lat: 14.6, lon: 121.0 }, f.units)).toBe('1380600000')
    expect(unitAt({ lat: 14.5547, lon: 121.0244 }, f.units)).toBe('1380600000') // Makati side
    expect(f.units.find((u: Unit) => u.code === '1108200000')).toBeTruthy() // Compostela Valley is filed under Davao de Oro
  })
  it('a border strip two simplified outlines both hold is not proven (release review: the clipped NCR file would read a false 0 there)', async () => {
    const { readFileSync } = await import('node:fs')
    const f = JSON.parse(readFileSync('public/geo/units.json', 'utf8'))
    expect(claims({ lat: 14.4578, lon: 120.9685 }, f.units)).toBeGreaterThan(1) // Cavite side of the NCR border
    expect(claims({ lat: 14.6, lon: 121.0 }, f.units)).toBe(1) // inside Metro Manila
    expect(claims({ lat: 0, lon: 0 }, f.units)).toBe(0)
  })
  it('a city inside the NCR outline would win by its smaller box, and its pack pointer lands on the owner', async () => {
    const { hazardsEntry } = await import('../../../scripts/local-data/lib.mjs')
    const ncr: Unit = { code: '1380600000', name: 'NCR', bbox: [0, 0, 10, 10], polys: [[sq(0, 10)]] }
    const cityU: Unit = { code: '1381300000', name: 'Invented City', bbox: [4, 4, 6, 6], polys: [[sq(4, 6)]] }
    expect(unitAt({ lat: 5, lon: 5 }, [ncr, cityU])).toBe('1381300000')
    const manifest = { '1380600000': { bounds: { flood: [0, 0, 10, 10] } }, '1381300000': { pack: '1380600000' } }
    const rows = [{ province_code: '1380600000', version: 1, checksum: 'c', size_bytes: 9, storage_path: 'p' }]
    expect(hazardsEntry('1381300000', manifest, rows)).toMatchObject({ pack: '1380600000', path: 'p' })
  })
})

describe('cities with their own outline (S23 F)', () => {
  it('a point in a highly urbanized city lands in that city, not the province or nothing', async () => {
    const { readFileSync } = await import('node:fs')
    const f = JSON.parse(readFileSync('public/geo/units.json', 'utf8'))
    expect(unitAt({ lat: 6.1164, lon: 125.1716 }, f.units)).toBe('1230800000') // General Santos
    expect(unitAt({ lat: 10.3157, lon: 123.8854 }, f.units)).toBe('0730600000') // Cebu City
    expect(unitAt({ lat: 7.0731, lon: 125.6128 }, f.units)).toBe('1130700000') // Davao City
    expect(unitAt({ lat: 11.2447, lon: 125.0048 }, f.units)).toBe('0831600000') // Tacloban
    expect(unitAt({ lat: 14.5547, lon: 121.0244 }, f.units)).toBe('1380600000') // Makati stays in the NCR union that owns the hazard pack
  })
})

describe('a point in a city is claimed exactly once (S23 F fix round)', () => {
  const load = async () => (JSON.parse((await import('node:fs')).readFileSync('public/geo/units.json', 'utf8')) as { units: Unit[] }).units
  it('claims() is 1 in the real file for the city centres and for two province points', async () => {
    const units = await load()
    const pts: [string, number, number, string][] = [
      ['GenSan', 6.1164, 125.1716, '1230800000'], ['Cebu', 10.3157, 123.8854, '0730600000'], ['Davao', 7.0731, 125.6128, '1130700000'], ['Tacloban', 11.2447, 125.0048, '0831600000'],
      ['Baguio', 16.4023, 120.596, ''], ['Zamboanga', 6.9214, 122.079, ''], ['Iloilo', 10.7202, 122.5621, ''], ['Bacolod', 10.6713, 122.9511, ''],
      ['Bohol province', 9.85, 124.15, '0701200000'], ['South Cotabato province', 6.3, 124.85, '1206300000']
    ]
    for (const [name, lat, lon, code] of pts) {
      expect({ name, n: claims({ lat, lon }, units) }).toEqual({ name, n: 1 })
      if (code) expect(unitAt({ lat, lon }, units)).toBe(code)
    }
  })
  it('every city that has a parent is claimed once at its own outline points and its parent is a bigger unit', async () => {
    const units = await load()
    const kids = units.filter((u) => u.parent)
    expect(kids.length).toBe(17)
    for (const k of kids) {
      expect(units.some((p) => p.code === k.parent && (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]) > (k.bbox[2] - k.bbox[0]) * (k.bbox[3] - k.bbox[1]))).toBe(true)
      const r = k.polys[0]![0]!, c = r.slice(0, -1).reduce((a, q) => [a[0]! + q[0]!, a[1]! + q[1]!], [0, 0]) // vertex mean of the biggest-first polygon
      const p = { lon: c[0]! / (r.length - 1), lat: c[1]! / (r.length - 1) }
      if (unitAt(p, units) === k.code) expect(claims(p, units)).toBe(1)
    }
  })
  it('a nested city does not hide a real border overlap: two provinces both holding a point still count 2, and a city plus its province counts 1', () => {
    const a: Unit = { code: 'A', name: 'A', bbox: [0, 0, 10, 10], polys: [[sq(0, 10)]] }
    const b: Unit = { code: 'B', name: 'B', bbox: [9, 0, 20, 10], polys: [[[[9, 0], [20, 0], [20, 10], [9, 10], [9, 0]]]] }
    const c: Unit = { code: 'C', name: 'City of C', bbox: [2, 2, 4, 4], polys: [[sq(2, 4)]], parent: 'A' }
    expect(claims({ lat: 5, lon: 9.5 }, [a, b, c])).toBe(2) // strip held by A and B
    expect(claims({ lat: 3, lon: 3 }, [a, b, c])).toBe(1) // C and A: the city only
    expect(claims({ lat: 1, lon: 1 }, [a, b, c])).toBe(1) // A only
    expect(claims({ lat: 3, lon: 3 }, [a, b, { ...c, parent: undefined }])).toBe(2) // without the parent record the old double claim comes back
  })
  it('a city sliver outside its province outline is not proven (S23 release review)', () => {
    const a: Unit = { code: 'A', name: 'A', bbox: [0, 0, 10, 10], polys: [[sq(0, 10)]] }
    const c: Unit = { code: 'C', name: 'City of C', bbox: [8, 8, 12, 12], polys: [[sq(8, 12)]], parent: 'A' }
    expect(claims({ lat: 9, lon: 9 }, [a, c])).toBe(1) // inside both: the city
    expect(claims({ lat: 11, lon: 11 }, [a, c])).toBe(0) // city only, province does not hold it
  })
})
