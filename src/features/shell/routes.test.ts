import { describe, expect, it } from 'vitest'
import { canonicalHash, hasOwnHeader, parseHash } from './routes'

describe('parseHash', () => {
  it('defaults to today', () => expect(parseHash('')).toEqual({ tab: 'today', view: null }))
  it('maps the old Records and Papers links to #family/papers (C-3)', () => {
    for (const old of ['#records', '#family/records', '#health/papers']) expect(canonicalHash(old)).toBe('#family/papers')
    expect(canonicalHash('#family/plan')).toBe('#family/plan')
    for (const old of ['#records', '#family/records', '#health/papers', '#family/papers']) expect(parseHash(old)).toEqual({ tab: 'family', view: 'papers' })
  })
  it('S25: the Library lives in Health again; old Discover library links and #health/videos come back to Health', () => {
    expect(canonicalHash('#health/library')).toBe('#health/library')
    expect(canonicalHash('#discover/learn/library')).toBe('#health/library')
    expect(canonicalHash('#discover/learn/library/c%3AHigh%20blood%20pressure')).toBe('#health/library/c%3AHigh%20blood%20pressure')
    expect(canonicalHash('#health/videos')).toBe('#health')
    expect(parseHash('#health/library')).toEqual({ tab: 'health', view: null })
    expect(parseHash('#discover/learn/library/m%3Ametformin')).toEqual({ tab: 'health', view: null })
    expect(parseHash('#health/videos')).toEqual({ tab: 'health', view: null })
  })
  it('sends #family/people and #people to the Family home, a member page stays', () => {
    expect(canonicalHash('#family/people')).toBe('#family')
    expect(canonicalHash('#people')).toBe('#family')
    expect(parseHash('#family/people')).toEqual({ tab: 'family', view: null })
    expect(parseHash('#people')).toEqual({ tab: 'family', view: null })
    expect(canonicalHash('#family/people/abc')).toBe('#family/people/abc')
    expect(parseHash('#family/people/abc')).toEqual({ tab: 'family', view: 'people' })
  })
  it('leaves every other hash alone', () => {
    for (const h of ['#health/labs', '#health/meds', '#health/library2', '#discover/learn', '#family/papers', '#me/alerts', '']) expect(canonicalHash(h)).toBe(h)
  })
  it('maps #family/plan and #family/messages to the family tab', () => {
    expect(parseHash('#family/plan')).toEqual({ tab: 'family', view: 'plan' })
    expect(parseHash('#plan')).toEqual({ tab: 'family', view: 'plan' })
    expect(parseHash('#family/messages')).toEqual({ tab: 'family', view: 'messages' })
    expect(parseHash('#family/calendar')).toEqual({ tab: 'family', view: 'calendar' })
  })
  it('maps every Settings group to the me view without a tab', () => {
    for (const g of ['alerts', 'display', 'family', 'phone', 'signin', 'about']) expect(parseHash('#me/' + g)).toEqual({ tab: null, view: 'me' })
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
describe('sharing routes (D-109)', () => {
  it('#sharing, #sharing/all and #sharing/<personId> are all the sharing view with their own header', () => {
    for (const h of ['#sharing', '#sharing/all', '#sharing/p1']) { expect(parseHash(h)).toEqual({ tab: null, view: 'sharing' }); expect(hasOwnHeader(h)).toBe(true) }
  })
})

describe('hasOwnHeader', () => {
  it('is true for sub-pages that draw Back + title', () => expect(['#weather', '#weather?from=action', '#health/metric/bp', '#health/refill', '#safety/map', '#gobag', '#medid', '#docs', '#family/people/p1', '#family/papers', '#me/alerts'].every(hasOwnHeader)).toBe(true))
  it('is false for tab roots', () => expect(['', '#today', '#health', '#family', '#family/plan', '#family/calendar', '#family/people', '#family/messages', '#safety', '#me'].some(hasOwnHeader)).toBe(false))
})
