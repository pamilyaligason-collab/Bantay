import { describe, expect, it } from 'vitest'
import { parseHash } from '../../shell/routes'
import { deskHref, parseDesk } from './types'

describe('admin desk routes', () => {
  it('plain #admin is the phone page, #admin/<page> the dashboard', () => {
    expect(parseDesk('#admin')).toBeNull()
    expect(parseDesk('#admin/queue')).toEqual({ page: 'queue', id: null })
    expect(parseDesk('#admin/records/p-1')).toEqual({ page: 'records', id: 'p-1' })
    expect(parseDesk('#admin/nope')).toEqual({ page: 'members', id: null })
    expect(parseDesk('#today')).toBeNull()
  })
  it('round-trips ids and keeps the admin view in the app router', () => {
    expect(parseDesk(deskHref('ids', 'a/b'))).toEqual({ page: 'ids', id: 'a/b' })
    expect(parseHash('#admin/members')).toEqual({ tab: null, view: 'admin' })
    expect(parseHash('#admin')).toEqual({ tab: null, view: 'admin' })
  })
})
