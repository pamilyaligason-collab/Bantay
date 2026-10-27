import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import type { NewsItem } from '../../safety/news'
import { ago, CACHE_MAX_BYTES, capBytes, isOfficial, loadFeed, NewsList, pinFirst } from './Screen'

const NOW = Date.parse('2026-10-28T10:20:00Z')
const row = (id: string, o: Partial<NewsItem> = {}): NewsItem => ({ id, title: `Headline ${id}`, url: `https://news.test/${id}`, source: 'PNA', kind: 'article', published_at: '2026-10-28T09:20:00Z', zone: null, ...o })
const ENV = { VITE_SUPABASE_URL: 'https://bantay-test.supabase.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key' }
const feedOf = (rows: NewsItem[]) => vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 })) as unknown as typeof fetch
const ROWS = [
  row('1'),
  row('2', { source: 'PAGASA', title: 'Rain advisory for Soccsksargen' }),
  row('3', { zone: 'davao' }),
  row('4', { url: 'javascript:alert(1)' }),
  row('5', { title: 'Invitation to bid for supply and delivery' })
]
beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('loadFeed', () => {
  it('reads news_items for the zone, drops other zones, bad links and bid notices, and asks the server for the zone', async () => {
    const f = feedOf(ROWS)
    const r = await loadFeed('gensan', NOW, f, ENV)
    expect(r.items!.map((n) => n.id)).toEqual(['1', '2']) // 3 is davao, 4 is a javascript: link, 5 is a bid notice
    expect(r.offline).toBe(false); expect(r.savedAt).toBe(NOW)
    const url = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('/rest/v1/news_items?'); expect(url).toContain('zone.eq.gensan')
  })
  it('offline it returns the saved list for 7 days, then nothing', async () => {
    await loadFeed('gensan', NOW, feedOf(ROWS), ENV)
    const down = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const day6 = await loadFeed('gensan', NOW + 6 * 86_400_000, down, ENV)
    expect(day6.offline).toBe(true); expect(day6.items!.map((n) => n.id)).toEqual(['1', '2']); expect(day6.savedAt).toBe(NOW)
    const day8 = await loadFeed('gensan', NOW + 8 * 86_400_000, down, ENV)
    expect(day8.items).toEqual([]); expect(day8.savedAt).toBeNull()
  })
  it('not configured and nothing saved is null; saved rows still show without a server address', async () => {
    expect((await loadFeed(null, NOW, feedOf([]), {})).items).toBeNull()
    await loadFeed('gensan', NOW, feedOf(ROWS), ENV)
    expect((await loadFeed('gensan', NOW + 1000, feedOf([]), {})).items!.map((n) => n.id)).toEqual(['1', '2'])
  })
  it('turns an ALL CAPS headline into a sentence', async () => {
    const r = await loadFeed(null, NOW, feedOf([row('9', { title: 'HEAVY RAIN IN CEBU' })]), ENV)
    expect(r.items![0]!.title).toBe('Heavy rain in Cebu')
  })
})

describe('cache cap', () => {
  const big = (id: string) => row(id, { title: 'x'.repeat(1000) }) // about 1.1 KB of JSON each
  it('keeps the newest rows that fit and drops the oldest first', () => {
    const rows = [big('a'), big('b'), big('c')]
    expect(capBytes(rows, 1500).map((n) => n.id)).toEqual(['a'])
    expect(capBytes(rows, 2500).map((n) => n.id)).toEqual(['a', 'b'])
    expect(capBytes(rows, 100_000)).toHaveLength(3)
    expect(CACHE_MAX_BYTES).toBe(2 * 1024 * 1024)
  })
})

describe('pinning and time', () => {
  it('official sources are matched on the source name, not the headline', () => {
    expect(isOfficial({ source: 'PAGASA' })).toBe(true)
    expect(isOfficial({ source: 'PHIVOLCS' })).toBe(true)
    expect(isOfficial({ source: 'GMA News' })).toBe(false)
    const { pinned, rest } = pinFirst([row('1', { title: 'DOH tips' }), row('2', { source: 'DOH' }), row('3')])
    expect(pinned.map((n) => n.id)).toEqual(['2']); expect(rest.map((n) => n.id)).toEqual(['1', '3'])
  })
  it('ago: 1 h, 25 min, just now, and a date after a day', () => {
    expect(ago('2026-10-28T09:20:00Z', NOW)).toBe('1 h ago')
    expect(ago('2026-10-28T09:55:00Z', NOW)).toBe('25 min ago')
    expect(ago('2026-10-28T10:20:00Z', NOW)).toBe('just now')
    expect(ago('2026-10-25T10:20:00Z', NOW)).toMatch(/Oct 25|25 Oct/)
  })
})

describe('NewsList screen', () => {
  const seed = (items: NewsItem[]) => db.kv.put({ key: 'discover.news', value: { savedAt: Date.now(), zone: null, items } })
  it('shows official advisories first, then headlines with source and Open, all as outside links, plus the saved-at band', async () => {
    await seed([row('1', { title: 'Fish port steady' }), row('2', { source: 'PAGASA', title: 'Rain advisory' })])
    render(<NewsList zone={null} now={NOW} />)
    const pin = await screen.findByRole('region', { name: 'Official advisories' })
    expect(within(pin).getByText('Rain advisory')).toBeTruthy()
    const all = screen.getAllByRole('link')
    expect(all[0]!.textContent).toContain('Rain advisory') // pinned comes before any headline
    expect(all[1]!.textContent).toContain('Fish port steady')
    expect(all[1]!.textContent).toContain('PNA')
    for (const a of all) { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('rel')).toContain('noopener') }
    expect(screen.getByText(/Headlines saved .* New ones when there is signal\./)).toBeTruthy()
    expect(screen.getByText(/No article text is kept/)).toBeTruthy()
  })
  it('with no official item in the feed, PAGASA and PHIVOLCS links stand in', async () => {
    await seed([row('1')])
    render(<NewsList zone={null} now={NOW} />)
    const pin = await screen.findByRole('region', { name: 'Official advisories' })
    expect(within(pin).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin', 'https://www.phivolcs.dost.gov.ph/'
    ])
  })
})
