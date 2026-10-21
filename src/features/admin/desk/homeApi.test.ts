import { describe, expect, it, vi } from 'vitest'

vi.mock('../../auth/client', () => ({ supabase: null }))

import { ago, bucketByDay, expiringCount, fieldsText, lastDays, lastWeeks, manilaDay, needsYou, queueSummary, summarize, toneIf } from './homeApi'

describe('Manila days', () => {
  it('puts 17:00 UTC on the next Manila day', () => {
    expect(manilaDay('2026-10-20T15:59:59Z')).toBe('2026-10-20')
    expect(manilaDay('2026-10-20T16:00:00Z')).toBe('2026-10-21')
  })
  it('lists days oldest first, ending today, and weeks on Mondays', () => {
    const now = new Date('2026-10-21T02:00:00Z') // Wednesday
    expect(lastDays(3, now)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
    expect(lastWeeks(2, now)).toEqual(['2026-10-12', '2026-10-19'])
  })
  it('buckets by Manila day and skips bad or out-of-range times', () => {
    const days = lastDays(3, new Date('2026-10-21T02:00:00Z'))
    expect(bucketByDay(['2026-10-20T15:00:00Z', '2026-10-20T16:30:00Z', '2026-10-21T01:00:00Z', 'nope', null, '2026-09-01T00:00:00Z'], days)).toEqual([0, 1, 2])
  })
})

describe('tone rules', () => {
  it('colours only when more than 0; unknown stays plain', () => {
    expect(toneIf(0, 'bad')).toBe('plain')
    expect(toneIf(null, 'bad')).toBe('plain')
    expect(toneIf(NaN, 'warn')).toBe('plain')
    expect(toneIf(3, 'warn')).toBe('warn')
  })
})

describe('expiringCount', () => {
  const today = '2026-10-21'
  it('counts today through +60 days inclusive and ignores blanks', () => {
    expect(expiringCount(['2026-10-20', '2026-10-21', '2026-12-20', '2026-12-21', null, undefined, '', 'bad'], today)).toBe(2)
  })
})

describe('summaries', () => {
  it('names the average and the busiest weekday', () => {
    expect(summarize([10, 40, 10], ['2026-10-19', '2026-10-20', '2026-10-21'])).toBe('Average 20 per day, highest Tuesday')
  })
  it('says so when there is nothing', () => {
    expect(summarize([0, 0], ['2026-10-19', '2026-10-20'])).toBe('No screens opened in this period.')
  })
  it('words weeks', () => {
    expect(summarize([2, 6], ['2026-10-12', '2026-10-19'], true)).toBe('Average 4 per week, highest week of Oct 19')
  })
  it('shows relative times and first three fields', () => {
    const now = Date.parse('2026-10-21T10:00:00Z')
    expect(ago('2026-10-21T08:00:00Z', now)).toBe('2 h ago')
    expect(ago('2026-10-21T09:59:30Z', now)).toBe('just now')
    expect(ago(null, now)).toBe('Never')
    expect(fieldsText(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2')
    expect(fieldsText(null)).toBe('')
  })
})

describe('queueSummary', () => {
  it('groups by person, sums kinds, ignores unknown counts, finds the biggest kind', () => {
    const s = queueSummary([
      { person_id: 'a', kind: 'lab_results', drafts: 5 },
      { person_id: 'a', kind: 'documents', drafts: 1 },
      { person_id: 'b', kind: 'lab_results', drafts: 7 },
      { person_id: 'c', kind: 'vaccinations', drafts: null as unknown as number },
      { person_id: 'c', kind: 'documents', drafts: 0 }
    ])
    expect(s.total).toBe(13)
    expect(s.byPerson.map((p) => [p.person_id, p.total])).toEqual([['b', 7], ['a', 6]])
    expect(s.byPerson[1].kinds[0]).toEqual({ kind: 'lab_results', n: 5 })
    expect(s.biggest).toEqual({ kind: 'lab_results', n: 12 })
    expect(queueSummary([]).biggest).toBeNull()
  })
})

describe('needsYou', () => {
  const base = { pins: [], personOf: () => null, dupes: 0, failed: 0, locked: [] }
  it('is empty when nothing needs attention (zero and unknown both skip)', () => {
    expect(needsYou(base)).toEqual([])
    expect(needsYou({ ...base, dupes: null, failed: null })).toEqual([])
  })
  it('links a PIN request to the member account tab, else the members list', () => {
    const pins = [{ id: 1, handle: 'test-a', user_id: 'u1', created_at: '2026-10-21T00:00:00Z' }, { id: 2, handle: 'test-b', user_id: 'u9', created_at: '2026-10-21T00:00:00Z' }]
    const n = needsYou({ ...base, pins, personOf: (u) => (u === 'u1' ? 'p1' : null) })
    expect(n.map((x) => x.href)).toEqual(['#/members/p1/account', '#/members'])
    expect(n[0].action).toBe('Reset PIN')
  })
  it('lists duplicates, failed scans and locked members', () => {
    const n = needsYou({ ...base, dupes: 1, failed: 4, locked: [{ name: 'Test Person', personId: 'p2' }] })
    expect(n.map((x) => x.text)).toEqual(['1 duplicate group to review', '4 scans failed', 'Test Person is locked out'])
  })
})
