import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewsRow } from '../discover/news/model'
const h = vi.hoisted(() => ({ items: [] as unknown as NewsRow[] | null, zone: null as string | null | undefined, calls: [] as (string | null)[] }))
vi.mock('../discover/news/Screen', async (orig) => ({ ...(await orig<typeof import('../discover/news/Screen')>()), loadFeed: async (z: string | null) => { h.calls.push(z); return { items: h.items, savedAt: 1, offline: false } }, useNewsZone: () => h.zone }))
import TodayNews, { freshHeadlines } from './TodayNews'

const NOW = Date.parse('2026-11-07T08:00:00Z')
const row = (id: string, ageH: number, o: Partial<NewsRow> = {}): NewsRow => ({ id, title: `Headline ${id}`, url: `https://news.example/${id}`, source: 'Example Daily', kind: 'article', published_at: new Date(NOW - ageH * 3_600_000).toISOString(), zone: null, ...o }) as NewsRow
afterEach(() => { cleanup(); h.items = []; h.zone = null; h.calls = [] })

describe('TodayNews', () => {
  it('shows the 3 newest with source and time; All news goes to Discover News', async () => {
    h.items = [row('b', 5), row('a', 1), row('d', 30), row('c', 2)]
    render(<TodayNews now={NOW} />)
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Headline/ })).toHaveLength(3))
    expect(screen.getAllByRole('link', { name: /Headline/ }).map((a) => a.querySelector('.tn-body')!.textContent)).toEqual(['Example Daily, 1 h agoHeadline a', 'Example Daily, 2 h agoHeadline c', 'Example Daily, 5 h agoHeadline b'])
    expect(screen.getByRole('link', { name: 'All news' }).getAttribute('href')).toBe('#discover/news')
  })
  it('shows a category tag per row and at most 2 of one category in the strip', async () => {
    h.items = [row('a', 1, { title: 'Typhoon Aling nears PAR', topic: 'prepping' }), row('b', 2, { title: 'Typhoon Bino update', topic: 'prepping' }), row('c', 3, { title: 'Typhoon Carlo forms', topic: 'prepping' }), row('d', 4, { title: 'Oil prices jump', topic: 'national' })]
    const { container } = render(<TodayNews now={NOW} />)
    await waitFor(() => expect(container.querySelectorAll('.tn-row')).toHaveLength(3))
    expect(Array.from(container.querySelectorAll('.tn-row')).map((a) => a.querySelector('.nw-tag')!.textContent)).toEqual(['TYPHOON', 'TYPHOON', 'OIL AND PRICES'])
    expect(container.querySelector('.tn-stale')).toBeNull()
  })
  it('says so when the newest headline is over 36 hours old, and only then', async () => {
    h.items = [row('a', 37), row('b', 40)]
    const { container } = render(<TodayNews now={NOW} />)
    await waitFor(() => expect(container.querySelectorAll('.tn-row')).toHaveLength(2))
    expect(container.querySelector('.tn-stale')!.textContent).toMatch(/over 36 hours old/)
  })
  it('drops rows older than 7 days and unreadable times', () => {
    expect(freshHeadlines([row('old', 24 * 7 + 1), row('new', 3), row('bad', 1, { published_at: 'x' })], NOW).map((n) => n.id)).toEqual(['new'])
  })
  it('hides the whole section with no fresh rows', async () => {
    h.items = [row('old', 24 * 8)]
    const { container } = render(<TodayNews now={NOW} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })
  it('hides when the feed is not configured (null)', async () => {
    h.items = null
    const { container } = render(<TodayNews now={NOW} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })
  it('a long title is clamped to 2 lines without overflow, and a thumbnail shows only for https', async () => {
    h.items = [row('a', 1, { title: 'Word'.repeat(80), image_url: 'https://img.example/a.jpg' }), row('b', 2, { image_url: 'http://img.example/b.jpg' }), row('c', 3)]
    const { container } = render(<TodayNews now={NOW} />)
    await waitFor(() => expect(container.querySelectorAll('.tn-title')).toHaveLength(3))
    expect(container.querySelectorAll('.tn-img img')).toHaveLength(1)
    expect(container.querySelector('.tn-img img')!.getAttribute('src')).toBe('https://img.example/a.jpg')
    const css = readFileSync('src/features/today/todayNews.css', 'utf8')
    const rule = (sel: string) => new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css)![1]!
    expect(rule('.tn-title')).toMatch(/-webkit-line-clamp: 2/)
    expect(rule('.tn-title')).toMatch(/overflow-wrap: anywhere/)
    expect(rule('.tn-title')).toMatch(/min-width: 0/)
    expect(rule('.tn-body')).toMatch(/min-width: 0/)
  })
  it('the https check is case-insensitive, and a broken image leaves no tile', async () => {
    h.items = [row('a', 1, { image_url: 'HTTPS://img.example/a.jpg' })]
    const { container } = render(<TodayNews now={NOW} />)
    await waitFor(() => expect(container.querySelector('.tn-img img')).not.toBeNull())
    expect(container.querySelector('.tn-img')!.getAttribute('data-fallback')).toBeNull()
    fireEvent.error(container.querySelector('.tn-img img')!)
    expect(container.querySelector('.tn-img img')).toBeNull()
    expect(container.querySelector('.tn-img')!.getAttribute('data-fallback')).toBe('true')
    expect(readFileSync('src/features/today/todayNews.css', 'utf8')).toContain('.tn-img[data-fallback="true"] { display: none; }')
  })
  it('waits for the place: no fetch while the zone is unknown, then one fetch for that zone', async () => {
    h.items = [row('a', 1)]
    h.zone = undefined
    const { rerender, container } = render(<TodayNews now={NOW} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(h.calls).toEqual([])
    expect(container.innerHTML).toBe('')
    h.zone = 'gensan'
    rerender(<TodayNews now={NOW} />)
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Headline/ })).toHaveLength(1))
    expect(h.calls).toEqual(['gensan'])
  })
  it('pull-to-refresh (bantay:refresh) reloads the feed and is awaited', async () => {
    h.items = [row('a', 1)]
    render(<TodayNews now={NOW} />)
    await waitFor(() => expect(h.calls).toHaveLength(1))
    h.items = [row('a', 1), row('n', 0.5, { title: 'Fresh one' })]
    let waited: Promise<unknown> | undefined
    await act(async () => { window.dispatchEvent(new CustomEvent('bantay:refresh', { detail: { waitUntil: (p: Promise<unknown>) => { waited = p } } })); await waited })
    expect(h.calls).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Fresh one/ })).toBeTruthy()
  })
  it('todayCalm.css uses calm.css tokens with the same values and no other hex but white', () => {
    const calm = readFileSync('src/features/calm/calm.css', 'utf8')
    const css = readFileSync('src/features/today/todayCalm.css', 'utf8')
    for (const [name, v] of [['--calm-deep', '#0E1B3A'], ['--calm-mint', '#A8C7FF']]) { expect(calm).toContain(`${name}: ${v}`); expect(css).toContain(`${name}: ${v}`) }
    expect(calm).toContain('#1D3A6E') // the lightest gradient stop calm.css checks its text against
    expect(css).toContain('--calm-mid: #1D3A6E')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b/gi)!.map((x) => x.toLowerCase()).filter((x) => !['#0e1b3a', '#1d3a6e', '#a8c7ff', '#fff'].includes(x))).toEqual([])
  })
})
