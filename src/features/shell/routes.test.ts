import { describe, expect, it } from 'vitest'
import { canonicalHash, hasOwnHeader, parseHash, familyEntry } from './routes'

describe('parseHash', () => {
  it('defaults to today', () => expect(parseHash('')).toEqual({ tab: 'today', view: null }))
  it('maps the old #records and #family/records links to Health > Papers', () => {
    expect(canonicalHash('#records')).toBe('#health/papers')
    expect(canonicalHash('#family/records')).toBe('#health/papers')
    expect(canonicalHash('#family/plan')).toBe('#family/plan')
    expect(parseHash('#records')).toEqual({ tab: 'health', view: null })
    expect(parseHash('#family/records')).toEqual({ tab: 'health', view: null })
    expect(parseHash('#health/papers')).toEqual({ tab: 'health', view: null })
  })
  it('maps #family/plan, #family/people and a member page to the family tab', () => {
    expect(parseHash('#family/plan')).toEqual({ tab: 'family', view: 'plan' })
    expect(parseHash('#family/people')).toEqual({ tab: 'family', view: 'people' })
    expect(parseHash('#family/people/abc')).toEqual({ tab: 'family', view: 'people' })
  })
  it('keeps #me and #notif as views without a tab', () => {
    expect(parseHash('#me')).toEqual({ tab: null, view: 'me' })
    expect(parseHash('#notif')).toEqual({ tab: null, view: 'notif' })
  })
  it('maps #docs and #docs/insurance to safety/docs', () => {
    expect(parseHash('#docs')).toEqual({ tab: 'safety', view: 'docs' })
    expect(parseHash('#docs/insurance')).toEqual({ tab: 'safety', view: 'docs' })
  })
  it('unknown hash falls back to today', () => expect(parseHash('#nope')).toEqual({ tab: 'today', view: null }))
})
describe('hasOwnHeader', () => {
  it('is true for sub-pages that draw Back + title', () => expect(['#weather', '#weather?from=action', '#health/metric/bp', '#health/refill', '#safety/map', '#gobag', '#medid', '#docs', '#family/people/p1'].every(hasOwnHeader)).toBe(true))
  it('is false for tab roots', () => expect(['', '#today', '#health', '#family', '#family/plan', '#family/people', '#safety', '#me'].some(hasOwnHeader)).toBe(false))
})
describe('familyEntry (D-44)', () => {
  it('opens People during an alert or SOS', () => expect(familyEntry({ alertActive: true, last: 'plan' })).toBe('people'))
  it('else reopens the last segment', () => expect(familyEntry({ alertActive: false, last: 'plan' })).toBe('plan'))
  it('first time opens People', () => expect(familyEntry({ alertActive: false, last: null })).toBe('people'))
})
