import { describe, expect, it } from 'vitest'
import { forChip, layout } from './View'
import { capPerCategory, categoryTag, freshLine, hueOf, initialOf, isStale, latestFirst, topicOf, topStories, type NewsRow } from './model'

const r = (id: string, min: number, topic?: string | null): NewsRow => ({ id, title: id, url: 'https://news.test/' + id, source: 'PNA', kind: 'article', published_at: new Date(Date.UTC(2026, 9, 28, 12, 0) - min * 60_000).toISOString(), topic })
const ids = (rows: NewsRow[]) => rows.map((n) => n.id)

describe('Latest', () => {
  it('is published_at descending whatever the input order', () => {
    expect(ids(latestFirst([r('b', 30), r('a', 5), r('c', 90)]))).toEqual(['a', 'b', 'c'])
  })
  it('an unreadable time sorts last', () => {
    expect(ids(latestFirst([{ ...r('x', 0), published_at: 'nope' }, r('a', 5)]))).toEqual(['a', 'x'])
  })
})

describe('Top: newest per topic, interleaved, prepping and health first', () => {
  const rows = [
    r('n1', 10, 'national'), r('p1', 50, 'prepping'), r('h1', 40, 'health'), r('w1', 5, 'wellbeing'),
    r('p2', 20, 'prepping'), r('h2', 70, 'health'), r('n2', 15, 'national'), r('u1', 1, null), r('wo', 3, 'world')
  ]
  it('round one takes the newest of prepping, health, national, wellbeing, world; round two the second newest; no-topic rows come last', () => {
    // hand-worked: prepping newest p2(20) then p1(50); health h1(40), h2(70); national n1(10), n2(15); wellbeing w1(5); world wo(3); no topic u1
    expect(ids(topStories(rows))).toEqual(['p2', 'h1', 'n1', 'w1', 'wo', 'p1', 'h2', 'n2', 'u1'])
  })
  it('a missing topic column (older server) falls back to newest first', () => {
    expect(ids(topStories([r('a', 30), r('b', 10), r('c', 20)]))).toEqual(['b', 'c', 'a'])
  })
  it('an unknown topic counts as no topic; nothing is lost or repeated', () => {
    const out = topStories([...rows, r('odd', 2, 'sports')])
    expect(out).toHaveLength(10)
    expect(new Set(ids(out)).size).toBe(10)
    expect(ids(out).slice(-2)).toEqual(['u1', 'odd']) // both no-topic, newest first (u1 is 1 min old, odd 2)
  })
})

describe('chips', () => {
  const rows = [r('p1', 10, 'prepping'), r('h1', 20, 'health'), r('p2', 5, 'prepping'), r('x', 1)]
  it('a topic chip shows only that topic, newest first; Latest shows everything', () => {
    expect(ids(forChip(rows, 'prepping'))).toEqual(['p2', 'p1'])
    expect(ids(forChip(rows, 'wellbeing'))).toEqual([])
    expect(ids(forChip(rows, 'latest'))).toEqual(['x', 'p2', 'p1', 'h1'])
    expect(ids(forChip(rows, 'top'))).toEqual(['p2', 'h1', 'p1', 'x'])
  })
  it('topicOf', () => {
    expect([topicOf({ topic: 'health' }), topicOf({ topic: null }), topicOf({}), topicOf({ topic: 'xyz' })]).toEqual(['health', null, null, null])
  })
})

describe('source mark', () => {
  it('first letter or digit, upper case; stable colour', () => {
    expect(initialOf('rappler')).toBe('R'); expect(initialOf('  (PNA)')).toBe('P'); expect(initialOf('24 Oras')).toBe('2'); expect(initialOf('')).toBe('?')
    expect(hueOf('PNA')).toBe(hueOf('PNA'))
    expect(hueOf('PNA')).toBeGreaterThanOrEqual(0); expect(hueOf('PNA')).toBeLessThan(6)
  })
})

describe('freshLine (band from the newest row, not the save time)', () => {
  const now = Date.UTC(2026, 9, 28, 12, 0)
  it('says how old the newest headline is', () => {
    expect(freshLine([r('a', 25), r('b', 900)], now, false)).toBe('Updated 25 min ago.')
    expect(freshLine([r('a', 180)], now, false)).toBe('Updated 3 h ago.')
    expect(freshLine([r('a', 4 * 1440 + 30), r('b', 6 * 1440)], now, false)).toBe('Newest headline 4 days old.')
    expect(freshLine([r('a', 1440)], now, false)).toBe('Newest headline 1 day old.')
  })
  it('offline adds the saved line; no rows or an unreadable date says nothing saved', () => {
    expect(freshLine([r('a', 5)], now, true)).toBe('Updated 5 min ago. Headlines saved. New ones when there is signal.')
    expect(freshLine([], now, false)).toMatch(/No headlines saved yet/)
    expect(freshLine([{ ...r('x', 0), published_at: 'nope' }], now, false)).toMatch(/No headlines saved yet/)
  })
})

describe('layout: a story shows once', () => {
  const rows = [r('p1', 10, 'prepping'), r('h1', 20, 'health'), r('n1', 30, 'national'), r('w1', 40, 'wellbeing'), r('x1', 50), r('x2', 60), r('x3', 70)]
  it('Top: lead p1, stories h1 n1 w1, Latest is only what is left, newest first', () => {
    const l = layout(rows, 'top')
    expect(l.lead!.id).toBe('p1'); expect(ids(l.stories)).toEqual(['h1', 'n1', 'w1']); expect(ids(l.latest)).toEqual(['x1', 'x2', 'x3'])
  })
  it('a topic chip: lead, up to three stories, the rest under Latest, no repeats', () => {
    const t = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => r(id, i * 5, 'health'))
    const l = layout(t, 'health')
    expect(l.lead!.id).toBe('a'); expect(ids(l.stories)).toEqual(['b', 'c', 'd']); expect(ids(l.latest)).toEqual(['e', 'f'])
  })
  it('the Latest chip is the whole list with no lead card, so every row can be saved', () => {
    const l = layout(rows, 'latest')
    expect(l.lead).toBeUndefined(); expect(l.stories).toEqual([]); expect(ids(l.latest)).toEqual(['p1', 'h1', 'n1', 'w1', 'x1', 'x2', 'x3'])
  })
  it('two rows: lead and one story, no Latest section', () => {
    const l = layout([r('a', 5), r('b', 9)], 'top')
    expect(l.lead!.id).toBe('a'); expect(ids(l.stories)).toEqual(['b']); expect(l.latest).toEqual([])
  })
})

describe('category tag, per-category cap, stale note (NEWS-PH)', () => {
  const t = (id: string, title: string, topic?: string): NewsRow => ({ ...r(id, 0, topic), title })
  it('tags from the headline and topic', () => {
    expect(categoryTag(t('a', 'Typhoon Rosal enters PAR', 'prepping'))).toBe('TYPHOON')
    expect(categoryTag(t('b', 'Oil prices jump as Iran tensions rise'))).toBe('OIL AND PRICES')
    expect(categoryTag(t('c', 'Clinic opens', 'health'))).toBe('HEALTH')
    expect(categoryTag(t('d', 'Plain headline'))).toBeNull()
  })
  it('keeps at most 2 per category in the given order; untagged rows are never counted', () => {
    const rows = [t('a', 'Typhoon one'), t('b', 'Typhoon two'), t('c', 'Typhoon three'), t('d', 'Plain one'), t('e', 'Plain two'), t('f', 'Plain three'), t('g', 'Clinic', 'health')]
    expect(ids(capPerCategory(rows, 2))).toEqual(['a', 'b', 'd', 'e', 'f', 'g'])
  })
  it('stale means the newest row is over 36 h old; exactly 36 h is fresh; no rows is not stale', () => {
    const now = Date.UTC(2026, 9, 28, 12, 0)
    expect(isStale([r('a', 36 * 60 + 1), r('b', 50 * 60)], now)).toBe(true)
    expect(isStale([r('a', 36 * 60)], now)).toBe(false)
    expect(isStale([r('a', 10), r('b', 90 * 60)], now)).toBe(false)
    expect(isStale([], now)).toBe(false)
    expect(isStale([{ ...r('x', 0), published_at: 'nope' }], now)).toBe(true)
  })
})
