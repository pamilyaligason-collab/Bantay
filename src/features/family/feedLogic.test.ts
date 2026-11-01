import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import { buildFeed, feedFilter } from './feedLogic'
import type { Photo } from './memoriesApi'
import type { Msg } from './messagesApi'

const now = new Date('2026-10-27T10:20:00+08:00')
const rd = (test: string, value: number, takenAt: string, personId = 'a'): Reading => ({ personId, test, value, takenAt })
const base = { checkins: [], readings: [], photos: [], msgs: [], selfId: 'me', now, thresholds: [] }

describe('buildFeed', () => {
  it('orders newest first and labels a check-in', () => {
    const f = buildFeed({ ...base, checkins: [{ personId: 'a', kind: 'check-in', startedAt: '2026-10-26T08:00:00+08:00' }, { personId: 'b', kind: 'check-in', startedAt: '2026-10-27T07:40:00+08:00' }, { personId: 'b', kind: 'mood-good', startedAt: '2026-10-27T09:00:00+08:00' }] })
    expect(f.map((x) => x.personId)).toEqual(['b', 'a'])
    expect(f[0]).toMatchObject({ kind: 'checkin', title: "I'm OK" })
  })
  it('a BP pair is one post with its word; a lone systolic makes none', () => {
    const t = '2026-10-27T07:00:00+08:00'
    const f = buildFeed({ ...base, readings: [rd('bp_systolic', 148, t), rd('bp_diastolic', 90, t), rd('bp_systolic', 120, '2026-10-26T07:00:00+08:00')] })
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ kind: 'reading', body: '148/90 mmHg', chip: { word: 'High', tint: 'red' } })
  })
  it('photos use the caption or a default; voice messages are skipped; old items drop', () => {
    const ph = (id: string, caption: string | null, createdAt: string): Photo => ({ id, path: id, caption, takenOn: null, createdAt, mine: true, url: null })
    const m = (id: string, kind: Msg['kind'], body: string | null): Msg => ({ id, clientId: null, mine: false, senderPersonId: 'a', kind, body, name: null, durationS: null, createdAt: '2026-10-27T09:00:00+08:00', url: null })
    const f = buildFeed({ ...base, photos: [ph('1', 'Lunch', '2026-10-27T08:00:00+08:00'), ph('2', null, '2026-10-26T08:00:00+08:00'), ph('3', 'Old', '2026-08-01T08:00:00+08:00')], msgs: [m('a', 'text', 'Hi'), m('b', 'voice', null)] })
    expect(f.map((x) => x.title)).toEqual(['Wrote in the family chat', 'Lunch', 'Shared a photo'])
  })
  it('filters by kind', () => {
    const t = '2026-10-27T07:00:00+08:00'
    const f = buildFeed({ ...base, checkins: [{ personId: 'a', kind: 'check-in', startedAt: t }], readings: [rd('bp_systolic', 120, t), rd('bp_diastolic', 80, t)] })
    expect(feedFilter(f, 'health').map((x) => x.kind)).toEqual(['reading'])
    expect(feedFilter(f, 'photos')).toEqual([])
    expect(feedFilter(f, 'all')).toHaveLength(2)
  })
})
