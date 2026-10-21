import { describe, expect, it } from 'vitest'
import { deskHref, parseDesk, webAdminUrl } from './types'

describe('web admin routes', () => {
  it('parses page, id and tab; unknown pages land on the dashboard', () => {
    expect(parseDesk('')).toEqual({ page: 'home', id: null, sub: null })
    expect(parseDesk('#/queue')).toEqual({ page: 'queue', id: null, sub: null })
    expect(parseDesk('#/members/p-1/account')).toEqual({ page: 'members', id: 'p-1', sub: 'account' })
    expect(parseDesk('#/people/p-1')).toEqual({ page: 'members', id: 'p-1', sub: null })
    expect(parseDesk('#/nope')).toEqual({ page: 'home', id: null, sub: null })
  })
  it('round-trips ids and tabs', () => {
    expect(parseDesk(deskHref('records', 'a/b', 'labs'))).toEqual({ page: 'records', id: 'a/b', sub: 'labs' })
    expect(deskHref('records', null, 'labs')).toBe('#/records')
  })
  it('sends old in-app dashboard links to /admin', () => {
    expect(webAdminUrl('#admin/queue')).toBe('/admin#/queue')
    expect(webAdminUrl('#admin/records/p1')).toBe('/admin#/records/p1')
    expect(webAdminUrl('#admin')).toBeNull()
    expect(webAdminUrl('#today')).toBeNull()
  })
})
