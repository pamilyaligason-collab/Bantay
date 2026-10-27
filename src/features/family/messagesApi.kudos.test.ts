import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  uploaded: [] as string[],
  insertError: null as null | { code: string }
}))
vi.mock('../auth/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: '00000000-0000-0000-0000-0000000000b1' } } } }) },
    from: () => ({ insert: async (row: Record<string, unknown>) => { h.inserted.push(row); return { error: h.insertError } } }),
    storage: { from: () => ({ upload: async (p: string) => { h.uploaded.push(p); return { error: null } }, remove: async () => ({ error: null }) }) }
  }
}))
vi.mock('../sync/sync', () => ({ syncNow: vi.fn() }))

import { KUDOS_VOICE_MAX_S, sendAttachment, sendKudosHeart } from './messagesApi'

beforeEach(() => { h.inserted.length = 0; h.uploaded.length = 0; h.insertError = null })

describe('kudos', () => {
  it('a heart is a kudos row with body heart about that person (no free text)', async () => {
    expect(await sendKudosHeart('10000000-0000-0000-0000-0000000000c1')).toEqual({ ok: true, data: null })
    expect(h.inserted).toHaveLength(1)
    expect(h.inserted[0]).toMatchObject({ kind: 'kudos', body: 'heart', about_person: '10000000-0000-0000-0000-0000000000c1' })
    expect(Object.keys(h.inserted[0]!).sort()).toEqual(['about_person', 'body', 'client_id', 'kind'])
  })
  it('a refused row is reported, not hidden', async () => {
    h.insertError = { code: '42501' }
    expect(await sendKudosHeart('p')).toMatchObject({ ok: false })
  })
  it('a voice kudos is capped at 15 seconds and carries the person', async () => {
    expect(KUDOS_VOICE_MAX_S).toBe(15)
    expect(await sendAttachment(new Blob(['x']), { kind: 'kudos', aboutPerson: 'person-1', ext: 'webm', mime: 'audio/webm', durationS: 44 })).toEqual({ ok: true, data: null })
    expect(h.inserted[0]).toMatchObject({ kind: 'kudos', duration_s: 15, about_person: 'person-1', attachment_name: null })
    expect(h.uploaded[0]).toMatch(/^00000000-0000-0000-0000-0000000000b1\/[0-9a-f-]{36}\.webm$/)
  })
  it('an ordinary voice note still caps at 60 and has no about_person', async () => {
    await sendAttachment(new Blob(['x']), { kind: 'voice', ext: 'webm', mime: 'audio/webm', durationS: 44 })
    expect(h.inserted[0]).toMatchObject({ kind: 'voice', duration_s: 44 })
    expect('about_person' in h.inserted[0]!).toBe(false)
  })
})
