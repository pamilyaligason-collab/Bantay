import { describe, expect, it } from 'vitest'
import { parseHash, familyEntry } from './routes'

describe('parseHash', () => {
  it('defaults to today', () => expect(parseHash('')).toEqual({ tab: 'today', view: null }))
  it('maps #records to family/records', () => expect(parseHash('#records')).toEqual({ tab: 'family', view: 'records' }))
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
describe('familyEntry (D-44)', () => {
  it('opens People during an alert or SOS', () => expect(familyEntry({ alertActive: true, last: 'records' })).toBe('people'))
  it('else reopens the last segment', () => expect(familyEntry({ alertActive: false, last: 'plan' })).toBe('plan'))
  it('first time opens Records', () => expect(familyEntry({ alertActive: false, last: null })).toBe('records'))
})
