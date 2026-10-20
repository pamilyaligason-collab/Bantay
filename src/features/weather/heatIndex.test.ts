import { describe, expect, it } from 'vitest'
import { HEAT_BANDS, heatBand, heatIndexC, heatIndexF } from './heatIndex'

// Reference values: NWS heat index chart (weather.gov/safety/heat-index), rounded to whole degrees F.
describe('heatIndexF', () => {
  it.each([
    [80, 40, 80], [80, 80, 84], [85, 60, 90], [90, 40, 91], [90, 50, 95], [90, 60, 100], [90, 70, 106], [90, 80, 113], [100, 40, 109], [100, 50, 118], [110, 40, 136]
  ])('%i F at %i%% feels like about %i F', (t, rh, want) => {
    expect(Math.abs(heatIndexF(t, rh) - want)).toBeLessThanOrEqual(1.5)
  })
  it('uses the simple formula below 80 F (close to the air temperature)', () => {
    expect(heatIndexF(70, 50)).toBeCloseTo(69, 0)
  })
  it('low humidity adjustment lowers the result, high humidity adjustment raises it', () => {
    const plain = (t: number, rh: number) => -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
    expect(heatIndexF(95, 10)).toBeLessThan(plain(95, 10))
    expect(heatIndexF(85, 95)).toBeGreaterThan(plain(85, 95))
  })
})

describe('heatIndexC', () => {
  it('33 C at 70% is about 43 C', () => {
    expect(heatIndexC(33, 70)).toBeGreaterThan(41.5)
    expect(heatIndexC(33, 70)).toBeLessThan(44.5)
  })
  it('unknown input is null, never 0', () => {
    expect(heatIndexC(null, 70)).toBeNull()
    expect(heatIndexC(33, undefined)).toBeNull()
    expect(heatIndexC(NaN, 70)).toBeNull()
  })
})

describe('heatBand (PAGASA bands, to confirm before release)', () => {
  it.each([[26.4, null], [27, 'caution'], [32.4, 'caution'], [33, 'extreme-caution'], [41.4, 'extreme-caution'], [41.6, 'danger'], [42, 'danger'], [51, 'danger'], [52, 'extreme-danger'], [60, 'extreme-danger']])('%f -> %s', (hi, id) => {
    expect(heatBand(hi)?.id ?? null).toBe(id)
  })
  it('every band has one action line', () => {
    expect(HEAT_BANDS).toHaveLength(4)
    for (const b of HEAT_BANDS) expect(b.action.length).toBeGreaterThan(5)
  })
  it('unknown is null', () => { expect(heatBand(null)).toBeNull() })
})
