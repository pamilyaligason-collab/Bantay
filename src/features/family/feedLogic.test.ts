import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import type { FeedRow } from '../../db'
import { buildFeed, feedFilter, feedFromRows, mergeFeed } from './feedLogic'
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

const fr = (kind: FeedRow['kind'], rowId: string, at: string, valueText: string | null, extra: Partial<FeedRow> = {}): FeedRow => ({ id: `${kind}|${rowId}`, kind, personId: 'a', at, titleKey: '', valueText, chip: null, photoPath: null, rowId, ...extra })
const th: { key: string; high?: number | null }[] = []

describe('feedFromRows (D-134)', () => {
  it('maps all four kinds', () => {
    const urls = new Map([['a/1.jpg', 'https://signed.test/1']])
    const f = feedFromRows([
      fr('bp', '1', '2026-10-27T07:00:00+08:00', '148/90 mmHg'),
      fr('lab', '2', '2026-10-27T06:00:00+08:00', 'Cholesterol 210 mg/dL', { chip: 'H' }),
      fr('photo', '3', '2026-10-27T05:00:00+08:00', 'Lunch', { photoPath: 'a/1.jpg' }),
      fr('status', '4', '2026-10-27T04:00:00+08:00', null)
    ], { selfId: 'a', now, thresholds: th, urls })
    expect(f.map((x) => x.kind)).toEqual(['reading', 'lab', 'photo', 'checkin'])
    expect(f[0]).toMatchObject({ title: 'Shared a blood pressure reading', body: '148/90 mmHg', chip: { word: 'High', tint: 'red' }, mine: true })
    expect(f[1]).toMatchObject({ title: 'Shared a lab result', body: 'Cholesterol 210 mg/dL', chip: { word: 'High', tint: 'amber' } })
    expect(f[2]).toMatchObject({ title: 'Lunch', url: 'https://signed.test/1' })
    expect(f[3]).toMatchObject({ title: "I'm OK", body: null })
  })
  it('a low lab says Low; an unknown chip shows none; a bp text that is not a pair, or a lab with no text, makes no post', () => {
    const f = feedFromRows([
      fr('lab', '1', '2026-10-27T07:00:00+08:00', 'Sodium 128 mmol/L', { chip: 'L' }),
      fr('lab', '2', '2026-10-27T06:00:00+08:00', 'Iron 80 ug/dL', { chip: 'N' }),
      fr('lab', '3', '2026-10-27T05:00:00+08:00', null),
      fr('bp', '4', '2026-10-27T04:00:00+08:00', '148')
    ], { selfId: null, now, thresholds: th })
    expect(f.map((x) => x.chip?.word)).toEqual(['Low', undefined])
    expect(f).toHaveLength(2)
    expect(f.every((x) => !x.mine)).toBe(true)
  })
  it('0008 flag A (abnormal) shows an Abnormal chip, H and L keep theirs, N none', () => {
    const f = feedFromRows([
      fr('lab', '1', '2026-10-27T07:00:00+08:00', 'ANA 1:80', { chip: 'A' }),
      fr('lab', '2', '2026-10-27T06:00:00+08:00', 'Iron 80 ug/dL', { chip: 'N' }),
      fr('lab', '3', '2026-10-27T05:00:00+08:00', 'Sodium 150 mmol/L', { chip: 'H' })
    ], { selfId: null, now, thresholds: th })
    expect(f.map((x) => x.chip?.word)).toEqual(['Abnormal', undefined, 'High'])
    expect(f[0].chip?.tint).toBe('amber')
  })
  it('a photo without a link or caption still posts with the default title and no image', () => {
    const [p] = feedFromRows([fr('photo', '1', '2026-10-27T07:00:00+08:00', null, { photoPath: 'a/2.jpg' })], { selfId: null, now, thresholds: th })
    expect(p).toMatchObject({ title: 'Shared a photo', url: null })
  })
  it('Health shows reading and lab posts', () => {
    const f = feedFromRows([fr('bp', '1', '2026-10-27T07:00:00+08:00', '120/80 mmHg'), fr('lab', '2', '2026-10-27T06:00:00+08:00', 'X 1'), fr('status', '3', '2026-10-27T05:00:00+08:00', null)], { selfId: null, now, thresholds: th })
    expect(feedFilter(f, 'health').map((x) => x.kind)).toEqual(['reading', 'lab'])
    expect(feedFilter(f, 'checkins').map((x) => x.kind)).toEqual(['checkin'])
  })
})

describe('mergeFeed', () => {
  it('adds your own post at once, once: the server copy of the same instant wins; posts older than 30 days drop; newest first', () => {
    const t = '2026-10-27T07:00:00+08:00'
    const server = feedFromRows([fr('bp', '1', t, '148/90 mmHg'), fr('status', '9', '2026-08-01T07:00:00+08:00', null)], { selfId: 'a', now, thresholds: th })
    const own = buildFeed({ ...base, selfId: 'a', readings: [rd('bp_systolic', 148, t, 'a'), rd('bp_diastolic', 90, t, 'a'), rd('bp_systolic', 130, '2026-10-27T10:00:00+08:00', 'a'), rd('bp_diastolic', 85, '2026-10-27T10:00:00+08:00', 'a')] })
    const m = mergeFeed(server, own, now)
    expect(m.map((x) => x.body)).toEqual(['130/85 mmHg', '148/90 mmHg'])
    expect(m[1].id).toBe('bp|1')
  })
})
