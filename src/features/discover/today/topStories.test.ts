import { describe, expect, it, vi } from 'vitest'
import type { Video } from '../../health/library/videosLogic'
import { READY_SHELVES, READY_VIDEOS } from '../learn/ready'
import { NEWS_CHANNELS } from '../newsvideo/api'
import { channelKey, trackWatch, watchName } from '../channels'
import { WATCH_CH_NAMES } from '../../admin/events'
import { rankTop, turn } from './topStories'

const t = vi.hoisted(() => ({ calls: [] as string[], rpc: null as null | (() => Promise<{ data: unknown; error: unknown }>) }))
vi.mock('../../admin/events', async (orig) => ({ ...(await orig<typeof import('../../admin/events')>()), track: async (_k: string, n: string) => { t.calls.push(n); return true } }))
vi.mock('../../auth/client', () => ({ get supabase() { return t.rpc ? { rpc: t.rpc } : null } }))
import { loadFamilyWatch } from './familyWatch'

const v = (id: string, source: string): Video => ({ id, placeholder: false, title: id, topic: 'x', source, minutes: null, sub: null })
// Six videos, three channels. Pool order: a1 a2 b1 b2 c1 c2.
const POOL = [v('a1', 'Alpha Farm'), v('a2', 'Alpha Farm'), v('b1', 'Beta DIY'), v('b2', 'Beta DIY'), v('c1', 'Gamma Prep'), v('c2', 'Gamma Prep')]
// 2026-01-02 is day 20455 since 1970; 20455 mod 6 = 1, so today's turn starts at the 2nd video: a2 b1 b2 c1 c2 a1
const DAY = new Date(2026, 0, 2, 10, 0)
const ids = (l: Video[]) => l.map((x) => x.id)

describe('rankTop fallback chain', () => {
  it('turn: the same day gives the same start, wrapping', () => {
    expect(ids(turn(POOL, DAY, 6))).toEqual(['a2', 'b1', 'b2', 'c1', 'c2', 'a1'])
    expect(ids(turn(POOL, DAY, 2))).toEqual(['a2', 'b1'])
  })
  it('3. no signal at all: today\'s turn, cut to k', () => {
    expect(ids(rankTop(POOL, DAY, 4, null, {}))).toEqual(['a2', 'b1', 'b2', 'c1'])
    expect(ids(rankTop(POOL, DAY, 4, {}, { zz: 0, a1: -3, b1: Number.NaN }))).toEqual(['a2', 'b1', 'b2', 'c1']) // zero, negative and NaN counts are no signal
  })
  it('2. this phone\'s taps decide when the family has none: the tapped channel leads, then one per channel in turn order', () => {
    // Gamma Prep has 2 taps (c2 twice). Groups in turn order: Alpha [a2 a1], Beta [b1 b2], Gamma [c1 c2]. Sorted by weight: Gamma, Alpha, Beta.
    // Round 0: c1 a2 b1; round 1: c2 a1 b2.
    expect(ids(rankTop(POOL, DAY, 6, null, { c2: 2 }))).toEqual(['c1', 'a2', 'b1', 'c2', 'a1', 'b2'])
    expect(ids(rankTop(POOL, DAY, 3, {}, { c2: 2 }))).toEqual(['c1', 'a2', 'b1'])
  })
  it('1. the family\'s counts win over this phone\'s: the channel with the most family taps leads, ties keep today\'s order', () => {
    const fam = { watch_ch_gma_news: 4 }
    const pool = [v('g1', 'GMA News'), v('p1', 'PAGASA'), v('p2', 'PAGASA'), v('f1', 'FEMA')]
    // 2026-01-02 mod 4 = 3: turn = f1 g1 p1 p2. GMA News (4) leads, then FEMA and PAGASA (0, turn order f1's group first).
    expect(ids(rankTop(pool, DAY, 4, fam, { p1: 99 }))).toEqual(['g1', 'f1', 'p1', 'p2'])
    // two channels counted: PAGASA 7 over GMA 4
    expect(ids(rankTop(pool, DAY, 4, { watch_ch_gma_news: 4, watch_ch_pagasa: 7 }, {}))).toEqual(['p1', 'g1', 'f1', 'p2'])
  })
  it('a family count for a channel not in the pool, or an unknown name, is no signal', () => {
    expect(ids(rankTop(POOL, DAY, 3, { watch_ch_gma_news: 5, 'bogus': 9 }, {}))).toEqual(['a2', 'b1', 'b2'])
  })
  it('is deterministic: the same inputs give the same order every time', () => {
    const a = ids(rankTop(POOL, DAY, 6, null, { b2: 1 }))
    for (let i = 0; i < 5; i++) expect(ids(rankTop(POOL, DAY, 6, null, { b2: 1 }))).toEqual(a)
  })
  it('an empty pool gives an empty list', () => {
    expect(rankTop([], DAY, 9, { watch_ch_gma_news: 1 }, { a: 1 })).toEqual([])
  })
})

describe('channel keys (D-180)', () => {
  it('channelKey: letters and single underscores, 31 characters at most, no edge underscores', () => {
    expect(channelKey("Raffy's Green Thumb")).toBe('raffy_s_green_thumb')
    expect(channelKey('ABS-CBN News')).toBe('abs_cbn_news')
    expect(channelKey('Swedish Civil Defence and Resilience Agency')).toBe('swedish_civil_defence_and_resil')
    expect(channelKey('  !! ')).toBe('')
  })
  it('every prepping, farming and DIY source and every regional news channel has an allowlisted watch_ch_ name; each name fits 40 letters and underscores', () => {
    const topics = READY_SHELVES.filter((s) => s.id === 'prepping' || s.id === 'farm-diy').map((s) => s.video)
    const labels = [...new Set([...READY_VIDEOS.filter((x) => topics.includes(x.topic)).map((x) => x.source), ...NEWS_CHANNELS.map((c) => c.label)])]
    expect(labels).toHaveLength(22) // counted by hand: 11 prepping + 9 farming and DIY sources, minus GMA News and ABS-CBN News listed twice, plus Bilyonaryo and GMA Public Affairs
    for (const l of labels) expect(watchName(l), l).not.toBeNull()
    expect(new Set(labels.map((l) => watchName(l))).size).toBe(22)
    expect(WATCH_CH_NAMES).toHaveLength(22)
    for (const n of WATCH_CH_NAMES) expect(n).toMatch(/^watch_ch_[a-z_]{1,31}$/)
  })
  it('watchName is null for an unknown, empty or missing channel; trackWatch then records nothing', () => {
    t.calls.length = 0
    expect(watchName('Some Other Channel')).toBeNull()
    expect(watchName('')).toBeNull()
    expect(watchName(undefined)).toBeNull()
    trackWatch('Some Other Channel'); trackWatch(null)
    expect(t.calls).toEqual([])
    trackWatch('FEMA')
    expect(t.calls).toEqual(['watch_ch_fema'])
  })
})

describe('loadFamilyWatch (migration 0060 reader)', () => {
  it('turns name/n rows into counts, keeping only allowlisted names and positive numbers', async () => {
    t.rpc = async () => ({ data: [{ name: 'watch_ch_fema', n: 3 }, { name: 'watch_ch_gma_news', n: '5' }, { name: 'watch_ch_made_up', n: 9 }, { name: 'watch_ch_pagasa', n: 0 }, { name: 7, n: 1 }], error: null })
    expect(await loadFamilyWatch()).toEqual({ watch_ch_fema: 3, watch_ch_gma_news: 5 })
  })
  it('null when signed out, offline, the function is not there yet, it throws, or nothing was watched', async () => {
    t.rpc = null
    expect(await loadFamilyWatch()).toBeNull()
    t.rpc = async () => ({ data: null, error: { message: 'function not found' } })
    expect(await loadFamilyWatch()).toBeNull()
    t.rpc = async () => { throw new Error('offline') }
    expect(await loadFamilyWatch()).toBeNull()
    t.rpc = async () => ({ data: [], error: null })
    expect(await loadFamilyWatch()).toBeNull()
  })
})
