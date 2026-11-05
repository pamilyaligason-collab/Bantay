import { describe, expect, it } from 'vitest'
import { alertHash } from './alertHash'

describe('alertHash: where a family alert opens', () => {
  it('share_added opens the list that shows who, every other template opens its tab', () => {
    expect(alertHash('share_added', 'today')).toBe('#sharing')
    expect(alertHash('share_given', 'family')).toBe('#family')
    expect(alertHash('dose_missed', 'health')).toBe('#health')
    expect(alertHash(undefined, 'today')).toBe('#today')
  })
  it("share_added opens my own list even when the row names a person; share_added_carer opens that person's list", () => {
    expect(alertHash('share_added', 'sharing', 'p1')).toBe('#sharing')
    expect(alertHash('share_added_carer', 'sharing', 'p 1/x')).toBe('#sharing/p%201%2Fx')
    expect(alertHash('share_added_carer', 'sharing', 'a1b2')).toBe('#sharing/a1b2')
  })
  it("share_added_carer without a person id (a push tap carries only the template) lands on Today, never on my own list", () => {
    expect(alertHash('share_added_carer', 'today')).toBe('#today')
    expect(alertHash('share_added_carer', 'today', null)).toBe('#today')
  })
})
