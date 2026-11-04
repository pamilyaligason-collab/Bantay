import { describe, expect, it } from 'vitest'
import { adviceLine, CALM_LINE } from './advice'

describe('adviceLine', () => {
  it('names the daily figure when only the hours ahead are dry', () => {
    expect(adviceLine(96, 45, [])).toBe('Rain likely later today (up to 96%). Nothing to act on in the next hours.')
  })
  it('is calm when nothing is likely', () => {
    expect(adviceLine(20, 10, [])).toBe(CALM_LINE)
    expect(adviceLine(null, null, [])).toBe(CALM_LINE)
  })
  it('names tomorrow when today is dry', () => {
    expect(adviceLine(30, 41, [], 65)).toBe('Rain likely tomorrow (65%).')
  })
  it('stays out of the way when action lines exist', () => {
    expect(adviceLine(96, 80, [{}])).toBeNull()
  })
})
