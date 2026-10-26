import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), member: vi.fn() }))
vi.mock('../auth/client', () => ({ supabase: { from: () => ({ update: h.update }) } }))
vi.mock('../auth/session', () => ({ getMember: h.member }))
import { CONSENT_VERSION, flushConsent, recordConsent } from './consent'

beforeEach(async () => {
  await db.kv.clear()
  h.eq.mockReset(); h.eq.mockResolvedValue({ error: null })
  h.update.mockReset(); h.update.mockReturnValue({ eq: h.eq })
  h.member.mockReset(); h.member.mockResolvedValue({ userId: 'u1', personId: 'p1', role: 'member', handle: 'mama' })
})

describe('consent notice (people.consent_at)', () => {
  it('writes consent_at, version 2026-10 and consent_by for the signed-in person only', async () => {
    expect(await recordConsent()).toBe(true)
    expect(CONSENT_VERSION).toBe('2026-10')
    const row = h.update.mock.calls[0]![0] as Record<string, string>
    expect(row.consent_version).toBe('2026-10')
    expect(row.consent_by).toBe('u1')
    expect(Number.isNaN(Date.parse(row.consent_at!))).toBe(false)
    expect(h.eq).toHaveBeenCalledWith('id', 'p1')
    expect((await db.kv.get('consent.pending'))).toBeUndefined() // sent, so nothing is kept
  })
  it('a refused or offline write keeps the intent and the next start sends it', async () => {
    h.eq.mockResolvedValueOnce({ error: { message: 'denied' } })
    expect(await recordConsent()).toBe(false)
    expect((await db.kv.get('consent.pending'))?.value).toBe(true)
    expect(await flushConsent()).toBe(true)
    expect((await db.kv.get('consent.pending'))).toBeUndefined()
  })
  it('flush with nothing pending does nothing (no write on every start)', async () => {
    expect(await flushConsent()).toBe(false)
    expect(h.update).not.toHaveBeenCalled()
  })
  it('no person row yet: kept for later, nothing thrown', async () => {
    h.member.mockResolvedValue({ userId: 'u1', personId: null, role: 'member', handle: null })
    expect(await recordConsent()).toBe(false)
    expect((await db.kv.get('consent.pending'))?.value).toBe(true)
  })
})
