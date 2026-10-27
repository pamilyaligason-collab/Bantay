import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ read: { data: null as unknown, error: null as unknown }, update: vi.fn(), updateErr: null as unknown, written: [{ id: 'p1' }] as unknown[] }))
vi.mock('../auth/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => h.read }) }),
      update: (v: unknown) => ({ eq: () => ({ is: (col: string, val: unknown) => { h.update(v, col, val); return { select: async () => ({ data: h.updateErr ? null : h.written, error: h.updateErr }) } } }) })
    })
  }
}))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1' }) }))
import { CONSENT_VERSION, consentDate, ensureConsent } from './consent'

beforeEach(() => { h.read = { data: null, error: null }; h.update.mockReset(); h.updateErr = null; h.written = [{ id: 'p1' }] })

describe('consentDate', () => {
  const now = new Date(2026, 9, 27)
  it('26 Oct this year, with the year for another year', () => {
    expect(consentDate(new Date(2026, 9, 26, 10).toISOString(), now)).toBe('26 Oct')
    expect(consentDate(new Date(2025, 0, 3, 10).toISOString(), now)).toBe('3 Jan 2025')
  })
  it('missing or unreadable is empty, never a made-up date', () => {
    expect(consentDate(null, now)).toBe('')
    expect(consentDate('nonsense', now)).toBe('')
  })
})

describe('ensureConsent (Q37 backfill)', () => {
  it('a recorded date is returned and never overwritten', async () => {
    h.read = { data: { consent_at: '2026-10-26T01:00:00.000Z' }, error: null }
    expect(await ensureConsent('p1')).toEqual({ at: '2026-10-26T01:00:00.000Z', backfilled: false })
    expect(h.update).not.toHaveBeenCalled()
  })
  it('an existing member with no date gets one, version 2026-10, guarded by "is null"', async () => {
    h.read = { data: { consent_at: null }, error: null }
    const r = await ensureConsent('p1')
    expect(r.backfilled).toBe(true)
    expect(r.at).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ consent_version: CONSENT_VERSION, consent_by: 'u1' }), 'consent_at', null)
    expect(CONSENT_VERSION).toBe('2026-10')
  })
  it('a failed read (offline, column not there yet) writes nothing: unknown is not "no consent"', async () => {
    h.read = { data: null, error: { message: 'x' } }
    expect(await ensureConsent('p1')).toEqual({ at: null, backfilled: false })
    expect(h.update).not.toHaveBeenCalled()
  })
  it('a write that matched 0 rows (another phone wrote first, or RLS filtered it) reports no date, never "agreed today"', async () => {
    h.read = { data: { consent_at: null }, error: null }
    h.written = []
    expect(await ensureConsent('p1')).toEqual({ at: null, backfilled: false })
    h.written = [{ id: 'p1' }]
  })
  it('a failed write reports no date', async () => {
    h.read = { data: { consent_at: null }, error: null }
    h.updateErr = { message: 'denied' }
    expect(await ensureConsent('p1')).toEqual({ at: null, backfilled: false })
  })
})
