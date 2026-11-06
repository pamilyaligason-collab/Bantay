import { describe, expect, it } from 'vitest'
import { forChip } from './View'
import { hueOf, initialOf, latestFirst, topicOf, topStories, type NewsRow } from './model'
import { watchPlan } from '../today/watchPlan'

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

describe('watchPlan', () => {
  const day = new Date(2026, 9, 28, 10, 20)
  it('main videos alternate prepping and health, DIY only ever comes after them in the row', () => {
    const { hero, row } = watchPlan(day, ['p1', 'p2', 'p3'], ['h1', 'h2', 'h3'], ['d1', 'd2'])
    const main = ['p1', 'h1', 'p2', 'h2', 'p3', 'h3']
    expect(main).toContain(hero)
    expect(row).toHaveLength(3)
    expect(main).toContain(row[0]); expect(main).toContain(row[1])
    expect(row[0]).not.toBe(hero); expect(row[1]).not.toBe(hero)
    expect(['d1', 'd2']).toContain(row[2])
  })
  it('same day, same picks; no DIY videos gives a row of main videos only; nothing at all gives no hero', () => {
    expect(watchPlan(day, ['p1', 'p2'], ['h1'], ['d1'])).toEqual(watchPlan(day, ['p1', 'p2'], ['h1'], ['d1']))
    expect(watchPlan(day, ['p1'], ['h1'], []).row).toHaveLength(1)
    expect(watchPlan(day, [], [], ['d1'])).toEqual({ hero: null, row: ['d1'] })
  })
})
