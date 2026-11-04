import { describe, expect, it } from 'vitest'
import { SWITCH_MS, type Unit, UnitTracker, unitAt } from './unitAt'

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
