import { describe, expect, it } from 'vitest'
import { SAFETY_IDS as APP_IDS } from '../notify/templates'
import { goneEndpoints, parseBody, SAFETY_IDS } from '../../../supabase/functions/broadcast/logic'

describe('broadcast function logic', () => {
  it('fixed ids match the app safety templates', () => {
    expect([...SAFETY_IDS].sort()).toEqual([...APP_IDS].sort())
  })
  it('accepts exactly {t} with a safety id', () => {
    expect(parseBody({ t: 'storm_warning' })).toBe('storm_warning')
  })
  it('rejects extra keys, health ids, free text and non-objects', () => {
    for (const b of [{ t: 'storm_warning', body: 'hi' }, { t: 'dose_due' }, { t: 'BP 150/95' }, { t: 5 }, {}, [], null, 'storm_warning', undefined, { body: 'x' }]) expect(parseBody(b), JSON.stringify(b)).toBeNull()
  })
  it('selects only 404 and 410 endpoints for deletion', () => {
    expect(goneEndpoints([{ endpoint: 'a', status: 201 }, { endpoint: 'b', status: 410 }, { endpoint: 'c', status: 404 }, { endpoint: 'd', status: 500 }, { endpoint: 'e', status: null }])).toEqual(['b', 'c'])
    expect(goneEndpoints([])).toEqual([])
  })
})
