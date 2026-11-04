import { describe, expect, it } from 'vitest'
import { hazardSub } from './hazardCards'

describe('W4 hazard row names which place was checked', () => {
  it('a reading here: the reading, as before', () => {
    expect(hazardSub({ label: 'here', value: 'Flood: High' }, { zone: 'Dampas', reading: { label: 'home', value: 'No high risks found' } })).toBe('Flood: High')
  })
  it('no reading here but one at the home zone: both are named', () => {
    expect(hazardSub(null, { zone: 'Dampas', reading: { label: 'home', value: 'Flood: High' } })).toBe('Not checked here · Dampas: Flood: High')
    expect(hazardSub({ label: 'here', value: null }, { zone: 'Dampas', reading: { label: 'home', value: 'No high risks found' } })).toBe('Not checked here · Dampas: No high risks found')
  })
  it('no reading anywhere: the old plain line', () => {
    expect(hazardSub(null, null)).toBe('Not checked for this place yet')
    expect(hazardSub(null, { zone: 'Dampas', reading: { label: 'home', value: null } })).toBe('Not checked for this place yet')
  })
})
