import { describe, expect, it } from 'vitest'
import { parseHash, familyEntry } from './routes'

describe('parseHash', () => {
  it('defaults to today', () => expect(parseHash('')).toEqual({ tab: 'today', view: null }))
  it('maps #records to family/records', () => expect(parseHash('#records')).toEqual({ tab: 'family', view: 'records' }))
  it('keeps #me and #notif as views without a tab', () => {
    expect(parseHash('#me')).toEqual({ tab: null, view: 'me' })
    expect(parseHash('#notif')).toEqual({ tab: null, view: 'notif' })
  })
  it('unknown hash falls back to today', () => expect(parseHash('#nope')).toEqual({ tab: 'today', view: null }))
})
describe('familyEntry (D-44)', () => {
  it('opens People during an alert or SOS', () => expect(familyEntry({ alertActive: true, last: 'records' })).toBe('people'))
  it('else reopens the last segment', () => expect(familyEntry({ alertActive: false, last: 'plan' })).toBe('plan'))
  it('first time opens Records', () => expect(familyEntry({ alertActive: false, last: null })).toBe('records'))
})
