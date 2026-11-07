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
