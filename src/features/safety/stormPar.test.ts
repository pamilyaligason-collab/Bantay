import { describe, expect, it } from 'vitest'
import { inPar, PAR, pauseOnData } from './stormPar'

describe('PAR', () => {
  it('is the published six-point ring', () => {
    expect(PAR).toEqual([[5, 115], [15, 115], [21, 120], [25, 120], [25, 135], [5, 135]])
  })
  it('Bohol is inside, Houston is not', () => {
    expect(inPar({ lat: 9.65, lon: 123.88 })).toBe(true)
    expect(inPar({ lat: 29.76, lon: -95.37 })).toBe(false)
  })
})

describe('pauseOnData', () => {
  it('pref off never pauses', () => {
    expect(pauseOnData({ type: 'cellular' }, false)).toBe(false)
  })
  it('cellular or save-data pauses', () => {
    expect(pauseOnData({ type: 'cellular' }, true)).toBe(true)
    expect(pauseOnData({ type: 'wifi', saveData: true }, true)).toBe(true)
  })
  it('wifi, unknown or missing connection does not', () => {
    expect(pauseOnData({ type: 'wifi' }, true)).toBe(false)
    expect(pauseOnData({}, true)).toBe(false)
    expect(pauseOnData(undefined, true)).toBe(false)
  })
})
