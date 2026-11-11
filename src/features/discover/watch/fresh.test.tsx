import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playable } from '../../health/library/videosLogic'
import { DISCOVER_VIDEOS, mergeFresh } from '../learn/ready'
import { loadFresh } from './fresh'
import Watch from './Screen'

// S33 L1: the Watch shelves put fresh watch_videos rows (marked New) before the checked list; with no usable row they are the checked list, exactly as before.
const s = vi.hoisted(() => ({ client: null as unknown, answer: (() => ({ data: [], error: null })) as () => unknown, query: [] as string[] }))
vi.mock('../../auth/client', () => ({ get supabase() { return s.client } }))
vi.mock('../../admin/events', async (orig) => ({ ...(await orig<typeof import('../../admin/events')>()), track: async () => true }))
const NOW = Date.now()
const DAY = 86_400_000
const row = (id: string, shelf: string, channel: string, title: string, daysAgo: number) => ({ video_id: id, shelf, channel, title, published_at: new Date(NOW - daysAgo * DAY).toISOString() })
const CURATED = DISCOVER_VIDEOS.filter(playable)

beforeEach(() => {
  s.query.length = 0
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'gte', 'order']) chain[m] = (...a: unknown[]) => { s.query.push(`${m}(${a.join(',')})`); return chain }
  chain.limit = (n: number) => { s.query.push(`limit(${n})`); return Promise.resolve().then(() => s.answer()) }
  s.client = { from: (t: string) => { s.query.push('from(' + t + ')'); return chain } }
})
afterEach(() => { cleanup(); s.client = null })

describe('mergeFresh', () => {
  const T = Date.parse('2026-11-11T02:00:00Z')
  const at = (days: number) => new Date(T - days * DAY).toISOString()
  const r = (id: string, shelf: string, days: number, title = 'T ' + id) => ({ video_id: id, shelf, channel: 'Chan', title, published_at: at(days) })
  const cur = CURATED.slice(0, 3)
  it('fresh newest first, then the checked list in its own order; fresh ones carry the flag and the shelf name', () => {
    const got = mergeFresh([r('aaaaaaaaaa1', 'recipes', 3), r('aaaaaaaaaa2', 'prepping', 1), r('aaaaaaaaaa3', 'farm-diy', 2)], cur, T)
    expect(got.map((v) => v.id)).toEqual(['aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa1', ...cur.map((v) => v.id)])
    expect(got.slice(0, 3).map((v) => [v.topic, v.fresh])).toEqual([['Be prepared', true], ['Farming and DIY', true], ['Recipe videos', true]])
    expect(got.slice(3).every((v) => v.fresh === undefined)).toBe(true)
  })
  it('a video in both lists shows once, as the fresh one', () => {
    const got = mergeFresh([r(cur[1]!.id, 'prepping', 1)], cur, T)
    expect(got.map((v) => v.id)).toEqual([cur[1]!.id, cur[0]!.id, cur[2]!.id])
    expect(got[0]!.fresh).toBe(true)
    expect(new Set(got.map((v) => v.id)).size).toBe(got.length)
  })
  it('a repeat inside the fresh rows shows once', () => {
    expect(mergeFresh([r('bbbbbbbbbb1', 'recipes', 1), r('bbbbbbbbbb1', 'recipes', 2)], [], T)).toHaveLength(1)
  })
  it('30 days is kept, 31 is not; a date in the future is not', () => {
    const got = mergeFresh([r('cccccccccc1', 'recipes', 30), r('cccccccccc2', 'recipes', 31), r('cccccccccc3', 'recipes', -1)], [], T)
    expect(got.map((v) => v.id)).toEqual(['cccccccccc1'])
  })
  it('at most 10 per shelf, the newest 10; another shelf is not affected', () => {
    const many = Array.from({ length: 12 }, (_, i) => r('dddddddd' + String(i).padStart(3, '0'), 'prepping', i + 1))
    const got = mergeFresh([...many, r('eeeeeeeeeee', 'recipes', 20)], [], T)
    expect(got.filter((v) => v.topic === 'Be prepared').map((v) => v.id)).toEqual(many.slice(0, 10).map((v) => v.video_id))
    expect(got.filter((v) => v.topic === 'Recipe videos')).toHaveLength(1)
  })
  it('skips a bad id, an unknown shelf, an empty title or channel, a bad date and non-rows; nothing usable gives the checked list untouched', () => {
    const bad = [r('short', 'recipes', 1), r('ffffffffff1', 'listen', 1), r('ffffffffff2', 'recipes', 1, '  '), { ...r('ffffffffff3', 'recipes', 1), channel: '' }, { ...r('ffffffffff4', 'recipes', 1), published_at: 'soon' }, null, 5, 'x', { video_id: 7 }]
    expect(mergeFresh(bad, cur, T)).toEqual(cur)
    for (const nothing of [null, undefined, {}, 'rows', []]) expect(mergeFresh(nothing, cur, T)).toEqual(cur)
  })
})

describe('loadFresh', () => {
  it('reads watch_videos newest first with the 30-day floor and a cap', async () => {
    s.answer = () => ({ data: [row('qqqqqqqqqq1', 'recipes', 'C', 'T', 1)], error: null })
    const got = await loadFresh(NOW)
    expect(got).toHaveLength(1)
    expect(s.query[0]).toBe('from(watch_videos)')
    expect(s.query).toContain('select(video_id,shelf,channel,title,published_at)')
    expect(s.query).toContain(`gte(published_at,${new Date(NOW - 30 * DAY).toISOString()})`)
    expect(s.query).toContain('order(published_at,[object Object])')
    expect(s.query).toContain('limit(60)')
  })
  it('an error, a throw, a rejection, a non-list and no client all give []', async () => {
    s.answer = () => ({ data: null, error: { code: '42P01' } }); expect(await loadFresh()).toEqual([])
    s.answer = () => { throw new Error('offline') }; expect(await loadFresh()).toEqual([])
    s.answer = () => ({ data: 'x', error: null }); expect(await loadFresh()).toEqual([])
    s.client = null; expect(await loadFresh()).toEqual([])
  })
})

describe('Watch with fresh rows', () => {
  const fresh = [row('frshPrep001', 'prepping', 'Philippine Red Cross', 'Typhoon safety: what to pack', 2), row('frshRcp0001', 'recipes', 'Kawaling Pinoy', 'Authentic Pinakbet in one pan', 1), row('frshFarm001', 'farm-diy', 'ATI Central Office', 'Gulayan sa Pamayanan', 3)]
  const names = () => screen.getAllByRole('button', { name: /^Video, / }).map((b) => b.getAttribute('aria-label')!)

  it('shows the fresh ones first with a New tag, then the checked videos; the count grows by the fresh ones', async () => {
    s.answer = () => ({ data: fresh, error: null })
    render(<Watch />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Watch · All videos' }).nextElementSibling!.textContent).toBe(String(CURATED.length + 3)))
    const n = names()
    expect(n.slice(0, 3)).toEqual(['Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New', 'Video, Typhoon safety: what to pack, Philippine Red Cross, New', 'Video, Gulayan sa Pamayanan, ATI Central Office, New'])
    expect(n[3]).toBe('Video, Disaster Wais: the go bag, Philippine Red Cross') // the first checked video follows, untagged
    expect(screen.getAllByText('New')).toHaveLength(3)
    expect(screen.getByTestId('watch-live').textContent).toBe(`Showing ${CURATED.length + 3} checked videos`)
  })
  it('the chips stay the same (no chip appears or moves) and a topic keeps its fresh video first', async () => {
    s.answer = () => ({ data: fresh, error: null })
    render(<Watch />)
    await waitFor(() => expect(screen.getAllByText('New')).toHaveLength(3))
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All', 'Be prepared', 'Farming and DIY', 'Listen', 'Recipe videos'])
    fireEvent.click(screen.getByTestId('playlist-Recipe videos'))
    expect(names()[0]).toBe('Video, Authentic Pinakbet in one pan, Kawaling Pinoy, New')
    expect(screen.getByRole('heading', { name: 'Watch · Recipe videos' }).nextElementSibling!.textContent).toBe(String(CURATED.filter((v) => v.topic === 'Recipe videos').length + 1))
    fireEvent.click(screen.getByTestId('playlist-Listen'))
    expect(screen.queryByText('New')).toBeNull() // Listen stays the checked list
  })
  it('a video that is both fresh and checked shows once (as New)', async () => {
    s.answer = () => ({ data: [row('oTyYzHntBxQ', 'prepping', 'Philippine Red Cross', 'Disaster Wais: the go bag', 4)], error: null })
    render(<Watch />)
    await waitFor(() => expect(screen.getAllByText('New')).toHaveLength(1))
    expect(screen.getByRole('heading', { name: 'Watch · All videos' }).nextElementSibling!.textContent).toBe(String(CURATED.length))
    expect(names().filter((x) => x.includes('Disaster Wais: the go bag'))).toEqual(['Video, Disaster Wais: the go bag, Philippine Red Cross, New'])
  })
  it('a fresh card opens its player like any other', async () => {
    s.answer = () => ({ data: fresh, error: null })
    const { container } = render(<Watch />)
    await waitFor(() => expect(screen.getAllByText('New')).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: /^Video, Typhoon safety: what to pack/ }))
    expect(container.querySelector('iframe')).toBeNull() // loads only after its own tap
    expect(screen.getByTestId('watch-player').querySelector('a[href="https://www.youtube.com/watch?v=frshPrep001"]')).toBeTruthy()
  })
})

describe('Watch falls back to the checked list, with no error shown', () => {
  const plain = async () => {
    render(<Watch />)
    await waitFor(() => expect(s.query).toContain('limit(60)')) // the read happened (or there is no client)
    await Promise.resolve()
    expect(screen.getByRole('heading', { name: 'Watch · All videos' }).nextElementSibling!.textContent).toBe(String(CURATED.length))
    expect(screen.queryByText('New')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(/error|failed|could not|table/i)
    expect(screen.getAllByRole('button', { name: /^Video, / })[0]!.getAttribute('aria-label')).toBe('Video, Disaster Wais: the go bag, Philippine Red Cross')
  }
  it('table missing (an error answer)', async () => { s.answer = () => ({ data: null, error: { code: '42P01', message: 'relation "public.watch_videos" does not exist' } }); await plain() })
  it('the read throws (offline)', async () => { s.answer = () => { throw new TypeError('Failed to fetch') }; await plain() })
  it('the table is empty', async () => { s.answer = () => ({ data: [], error: null }); await plain() })
  it('only unusable rows come back', async () => { s.answer = () => ({ data: [{ video_id: 'x', shelf: 'recipes' }, null], error: null }); await plain() })
  it('no signed-in client at all (the plain build)', async () => {
    s.client = null
    render(<Watch />)
    await Promise.resolve()
    expect(screen.getByRole('heading', { name: 'Watch · All videos' }).nextElementSibling!.textContent).toBe(String(CURATED.length))
    expect(screen.queryByText('New')).toBeNull()
  })
})
