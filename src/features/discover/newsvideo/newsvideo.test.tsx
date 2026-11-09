import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake supabase: rows is what the table answers; eq narrows by channel_id like the real filter; `fail` is a read error.
const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  fail: false,
  connected: true,
  kv: new Map<string, { value: unknown }>(),
  eqs: [] as string[],
  reads: 0
}))
const tr = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../../admin/events', async (orig) => ({ ...(await orig<typeof import('../../admin/events')>()), track: async (_k: string, n: string) => { tr.calls.push(n); return true } }))
vi.mock('../../../db', () => ({ db: { kv: { get: async (k: string) => { h.reads++; return h.kv.get(k) }, put: async (v: { key: string; value: unknown }) => { h.kv.set(v.key, v) } } } }))
vi.mock('../../auth/client', () => ({
  get supabase() {
    if (!h.connected) return null
    return {
      from: () => {
        let channel: string | null = null
        const q = {
          select: () => q,
          order: () => q,
          limit: () => q,
          eq: (_c: string, v: string) => { channel = v; h.eqs.push(v); return q },
          then: (ok: (r: unknown) => unknown) => ok(h.fail ? { data: null, error: { message: 'x' } } : { data: h.rows.filter((r) => !channel || r.channel_id === channel), error: null })
        }
        return q
      }
    }
  }
}))
import { ageText, loadNewsVideos, updatedLine } from './api'
import { NewsVideos } from './NewsVideos'

const NOW = Date.parse('2026-11-08T12:00:00Z')
const GMA = 'UCqYw-CTd1dU2yGI71sEyqNw'
const ABS = 'UCE2606prvXQc_noEqKxVJXA'
const mk = (n: number, channel_id: string, channel: string, minsAgo: number) => ({
  video_id: ('vid' + String(n).padStart(8, '0')), channel_id, channel, title: `Story ${n}`, published_at: new Date(NOW - minsAgo * 60_000).toISOString(), fetched_at: new Date(NOW - 12 * 60_000).toISOString()
})
// Newest first, as the table answers: 40 min, 90 min, 5 h, 26 h, 3 d, 3 d.
const SEVEN = [mk(1, GMA, 'GMA News', 40), mk(2, ABS, 'ABS-CBN News', 90), mk(3, GMA, 'GMA News', 300), mk(4, ABS, 'ABS-CBN News', 26 * 60), mk(5, GMA, 'GMA News', 3 * 1440 - 5), mk(6, ABS, 'ABS-CBN News', 3 * 1440 - 10)]

beforeEach(() => { h.rows = []; h.fail = false; h.connected = true; h.kv.clear(); h.eqs = []; h.reads = 0 })
afterEach(cleanup)

describe('ageText and updatedLine', () => {
  it('minutes under an hour, then hours, then days', () => {
    const at = (m: number) => new Date(NOW - m * 60_000).toISOString()
    expect(ageText(at(40), NOW)).toBe('40 min ago')
    expect(ageText(at(0), NOW)).toBe('1 min ago')
    expect(ageText(at(59), NOW)).toBe('59 min ago')
    expect(ageText(at(60), NOW)).toBe('1 hr ago')
    expect(ageText(at(300), NOW)).toBe('5 hr ago')
    expect(ageText(at(24 * 60), NOW)).toBe('1 day ago')
    expect(ageText(at(2 * 24 * 60 + 5), NOW)).toBe('2 days ago')
    expect(ageText(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe('1 min ago') // a clock a little behind never shows a negative age
  })
  it('Updated n min ago, hours, days', () => {
    expect(updatedLine(NOW - 12 * 60_000, NOW)).toBe('Updated 12 min ago')
    expect(updatedLine(NOW - 20_000, NOW)).toBe('Updated just now')
    expect(updatedLine(NOW - 3 * 3_600_000, NOW)).toBe('Updated 3 hr ago')
    expect(updatedLine(NOW - 50 * 3_600_000, NOW)).toBe('Updated 2 d ago')
  })
})

describe('loadNewsVideos', () => {
  it('reads newest rows, drops malformed ones, takes fetchedAt from the newest fetched_at and saves the list', async () => {
    h.rows = [...SEVEN.slice(0, 2), { ...mk(9, GMA, 'GMA News', 5), video_id: 'short' }, { ...mk(8, GMA, 'GMA News', 5), title: '' }]
    const got = await loadNewsVideos(undefined, NOW)
    expect(got!.rows.map((r) => r.title)).toEqual(['Story 1', 'Story 2'])
    expect(got!.fetchedAt).toBe(NOW - 12 * 60_000)
    expect((h.kv.get('discover.newsvideo.all')!.value as { savedAt: number }).savedAt).toBe(NOW)
  })
  it('no fetched_at on any row: fetchedAt is null (never now) and the heading shows no Updated line', async () => {
    h.rows = SEVEN.slice(0, 2).map(({ fetched_at: _f, ...r }) => r)
    const got = await loadNewsVideos(undefined, NOW)
    expect(got!.fetchedAt).toBeNull()
    render(<NewsVideos now={NOW} />)
    await screen.findByTestId('nv-lead')
    expect(screen.queryByText(/Updated/)).toBeNull()
  })
  it('a channel id narrows the read and has its own saved copy', async () => {
    h.rows = SEVEN
    const got = await loadNewsVideos(ABS, NOW)
    expect(got!.rows.map((r) => r.title)).toEqual(['Story 2', 'Story 4', 'Story 6'])
    expect(h.eqs).toEqual([ABS])
    expect(h.kv.has('discover.newsvideo.' + ABS)).toBe(true)
  })
  it('offline (a failed read, or no connection): the saved copy while under 3 days old, else null', async () => {
    h.rows = SEVEN
    await loadNewsVideos(undefined, NOW)
    h.fail = true
    expect((await loadNewsVideos(undefined, NOW + 2 * 86_400_000))!.rows).toHaveLength(6)
    expect(await loadNewsVideos(undefined, NOW + 4 * 86_400_000)).toBeNull()
    h.fail = false; h.connected = false
    expect((await loadNewsVideos(undefined, NOW + 3_600_000))!.fetchedAt).toBe(NOW - 12 * 60_000) // the saved time, not now
    expect((await loadNewsVideos(ABS, NOW))!.rows.map((r) => r.title)).toEqual(['Story 2', 'Story 4', 'Story 6']) // no copy of its own: cut from the saved all-channels copy
    expect(await loadNewsVideos('UCj5RwDivLksanrNvkW0FB4w', NOW)).toEqual({ rows: [], fetchedAt: NOW - 12 * 60_000 }) // a channel with no saved video is an empty list, not a vanished section
  })
})

describe('Regional news section', () => {
  it('shows heading, Updated 12 min ago, NO channel chips, the newest as a hero card then 4 rows and Show more', async () => {
    h.rows = SEVEN
    render(<NewsVideos now={NOW} />)
    const sec = await screen.findByTestId('dc-regional')
    expect(within(sec).getByRole('heading', { level: 2 }).textContent).toBe('Regional news')
    expect(sec.textContent).toContain('Updated 12 min ago')
    expect(within(sec).queryByRole('group', { name: 'News channels' })).toBeNull() // S28: the channel chip row is gone
    expect(within(sec).queryByRole('button', { name: 'GMA News' })).toBeNull()
    expect(within(sec).queryByRole('button', { name: 'All' })).toBeNull()
    expect(sec.querySelector('.nw-chip, .nv-chips, select')).toBeNull()
    const lead = within(sec).getByTestId('nv-lead')
    expect(lead.className).toContain('md-hero')
    expect(lead.querySelector('.md-meta')!.textContent).toBe('GMA News · 40 min ago')
    expect(lead.textContent).toContain('Story 1')
    expect(lead.querySelector('img')!.getAttribute('src')).toBe('https://i.ytimg.com/vi/vid00000001/mqdefault.jpg')
    expect(lead.querySelector('img')!.getAttribute('referrerpolicy')).toBe('no-referrer')
    const cards = within(sec).getAllByTestId('nv-card')
    expect(cards).toHaveLength(4) // 5 rows after the lead: 4 show, 1 more
    expect(cards.map((c) => c.querySelector('.md-meta')!.textContent)).toEqual(['ABS-CBN News · 1 hr ago', 'GMA News · 5 hr ago', 'ABS-CBN News · 1 day ago', 'GMA News · 2 days ago'])
    fireEvent.click(within(sec).getByRole('button', { name: 'Show 1 more' }))
    expect(within(sec).getAllByTestId('nv-card')).toHaveLength(5)
    expect(sec.querySelector('.carousel')).toBeNull()
  })
  it('a tap on a card plays that video through LiteVideo: nothing loads until the video\'s own tap', async () => {
    h.rows = SEVEN
    h.reads = 0
    const { container } = render(<NewsVideos now={NOW} />)
    fireEvent.click(await screen.findByTestId('nv-lead'))
    const player = screen.getByTestId('nv-player')
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(within(player).getByRole('button', { name: 'Play Story 1' }))
    expect(container.querySelector('iframe')!.getAttribute('src')).toContain('youtube-nocookie.com/embed/vid00000001')
    fireEvent.click(screen.getAllByTestId('nv-card')[0]!)
    expect(within(screen.getByTestId('nv-player')).getByRole('button', { name: 'Play Story 2' })).toBeTruthy()
  })
  it('a news card is named "Video, title, channel", counts card_regional_video and its channel (watch_ch_<key>) on a tap, and focus moves to the player', async () => {
    h.rows = SEVEN
    tr.calls.length = 0
    render(<NewsVideos now={NOW} />)
    const lead = await screen.findByTestId('nv-lead')
    expect(lead.getAttribute('aria-label')).toBe('Video, Story 1, GMA News')
    fireEvent.click(lead)
    expect(tr.calls).toEqual(['card_regional_video', 'watch_ch_gma_news'])
    fireEvent.click(screen.getAllByTestId('nv-card')[0]!)
    expect(tr.calls.slice(2)).toEqual(['card_regional_video', 'watch_ch_abs_cbn_news'])
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByTestId('nv-player')).getByRole('button', { name: 'Play Story 2' })))
  })
  it('a channel that is not on the list is counted as a card tap only, never under a made-up name', async () => {
    h.rows = [mk(1, 'UCzzzzzzzzzzzzzzzzzzzzzz', 'Some Other Channel 9', 10)]
    tr.calls.length = 0
    render(<NewsVideos now={NOW} />)
    fireEvent.click(await screen.findByTestId('nv-lead'))
    expect(tr.calls).toEqual(['card_regional_video'])
  })
  it('an empty table shows the quiet message', async () => {
    render(<NewsVideos now={NOW} />)
    expect(await screen.findByText('No news videos yet')).toBeTruthy()
  })
  it('offline with a saved copy: the last list shows with its own Updated time; offline with nothing saved: hidden', async () => {
    h.rows = SEVEN
    const first = render(<NewsVideos now={NOW} />)
    await screen.findByTestId('nv-lead')
    first.unmount()
    h.connected = false
    render(<NewsVideos now={NOW + 3_600_000} />) // an hour later
    expect((await screen.findByTestId('dc-regional')).textContent).toContain('Updated 1 hr ago')
    expect(screen.getByTestId('nv-lead').textContent).toContain('Story 1')
    cleanup(); h.kv.clear()
    h.reads = 0
    const { container } = render(<NewsVideos now={NOW} />)
    await waitFor(() => expect(h.reads).toBeGreaterThan(0)) // the read has settled with nothing saved
    expect(container.innerHTML).toBe('')
  })
})
