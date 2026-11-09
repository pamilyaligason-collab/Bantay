import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeed } from './news/Screen'
import type { NewsRow } from './news/model'
import { db } from '../../db'
import { RECIPES } from './learn/data'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import css from './today.css?raw'
import discoverCss from './discover.css?raw'
import mediaCss from '../look/media/media.css?raw'
import Overview from './Overview'

const ev = vi.hoisted(() => ({ calls: [] as string[], news: null as null | { rows: Record<string, string>[]; fetchedAt: number | null }, family: null as null | Record<string, number>, rpcCalls: 0 }))
vi.mock('../admin/events', async (orig) => ({ ...(await orig<typeof import('../admin/events')>()), track: async (_k: string, n: string) => { ev.calls.push(n); return true } }))
// the family counts come through the same rpc the app uses (migration 0060): null = signed out, an object = the rows the server returns
vi.mock('../auth/client', () => ({ get supabase() { return ev.family === null ? null : { auth: { getSession: async () => ({ data: { session: null } }) }, rpc: async () => { ev.rpcCalls++; return { data: Object.entries(ev.family!).map(([name, n]) => ({ name, n })), error: null } } } } }))
vi.mock('./newsvideo/api', async (orig) => ({ ...(await orig<typeof import('./newsvideo/api')>()), useNewsVideos: () => ev.news }))
vi.mock('./news/Screen', async (orig) => ({ ...(await orig<typeof import('./news/Screen')>()), useNewsZone: () => null, loadFeed: vi.fn() }))
const row = (id: string, o: Partial<NewsRow> = {}): NewsRow => ({ id, title: 'Headline ' + id, url: 'https://news.test/' + id, source: 'PNA', kind: 'article', published_at: '2026-10-28T09:20:00Z', zone: null, ...o })
const feed = (items: NewsRow[] | null) => vi.mocked(loadFeed).mockResolvedValue({ items, savedAt: null, offline: false })

beforeEach(async () => { ev.calls.length = 0; ev.news = null; ev.family = null; ev.rpcCalls = 0; feed([]); location.hash = '#discover'; sessionStorage.clear(); localStorage.clear(); await db.kv.clear() })
afterEach(cleanup)

const now = new Date(2026, 9, 28, 10, 20)
/** Top stories are read once per day before they show (never a list that then moves): wait for the hero. */
const show = async (at: Date = now) => { const r = render(<Overview now={at} />); await screen.findByTestId('dc-hero'); return r }
const tab = (name: string) => screen.getByRole('tab', { name })

describe('head and the Today | News | Saved control', () => {
  it('draws the large title with the kicker and a search button', async () => {
    await show()
    const head = screen.getByTestId('dc-head')
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(head.querySelector('.lt-kicker')!.textContent).toBe('Learn, watch, play')
    expect(screen.getByTestId('dc-search').getAttribute('href')).toBe('#health/library') // S25: the library moved into Health
  })
  it('is a tablist of three tabs, Today selected, one tabpanel labelled by the selected tab', async () => {
    await show()
    expect(screen.getByRole('tablist', { name: 'Discover views' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([['Today', 'true'], ['News', 'false'], ['Saved', 'false']])
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Today').id)
    expect(tab('Today').getAttribute('aria-controls')).toBe(panel.id)
    expect(tab('News').getAttribute('tabindex')).toBe('-1')
  })
  it('a click or an arrow key moves the selection and the panel follows; Home and End jump', async () => {
    await show()
    fireEvent.click(tab('News'))
    expect(tab('News').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab('News').id)
    expect(await screen.findByRole('group', { name: 'News topics' })).toBeTruthy()
    fireEvent.keyDown(tab('News'), { key: 'ArrowRight' })
    expect(tab('Saved').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Saved'))
    fireEvent.keyDown(tab('Saved'), { key: 'ArrowRight' })
    expect(tab('Today').getAttribute('aria-selected')).toBe('true') // wraps
    fireEvent.keyDown(tab('Today'), { key: 'End' })
    expect(tab('Saved').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tab('Saved'), { key: 'Home' })
    expect(tab('Today').getAttribute('aria-selected')).toBe('true')
  })
})

describe('Today: sections in order', () => {
  it('Learn, Top stories, Regional news, Listen, Farming and DIY, then the rest (Health pointer, Recipes, Play, Did you know)', async () => {
    ev.news = { rows: [{ video_id: 'abcdefghijk', channel_id: 'c', channel: 'GMA News', title: 'Story one', published_at: '2026-10-28T09:00:00Z' }], fetchedAt: null }
    await show()
    const ids = ['dc-learn', 'dc-top-story', 'dc-regional', 'dc-listen', 'dc-farm', 'dc-health-link', 'dc-recipes', 'dc-play', 'dc-fact']
    const els = ids.map((i) => screen.getByTestId(i))
    els.slice(1).forEach((e, i) => expect(els[i]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Learn', 'Top stories', 'Regional news', 'Listen', 'Farming and DIY', 'Recipes', 'Play'])
  })
  it('no news headline and no season row on Today: the news lives on the Today tab (D-142); the News tab stays', async () => {
    feed([row('a')])
    await show()
    expect(screen.queryByTestId('dc-lead')).toBeNull()
    expect(screen.queryByTestId('season-row')).toBeNull()
    expect(screen.queryByText(/All news/)).toBeNull()
    fireEvent.click(tab('News'))
    expect(await screen.findByRole('group', { name: 'News topics' })).toBeTruthy()
  })
})

const idOf = (img: Element) => /vi\/([\w-]{11})\//.exec(img.getAttribute('src')!)![1]
const pics = (el: Element) => Array.from(el.querySelectorAll('.md-pic img'))
const tracked = () => ev.calls.filter((n) => !n.startsWith('watch_ch_'))

describe('Top stories (farming, DIY and prepping videos together)', () => {
  // The pool is the 20 prepping videos then the 23 farming and DIY videos in ready.json (43). 28 Oct 2026 is day 20754 since 1970; 20754 mod 43 = 28,
  // so with no signal the turn starts at the 29th video (index 28, counted by hand): a hero and eight rows, 4 of them shown until Show more.
  it('no signal: one hero and rows from today\'s turn of the farm, DIY and prepping pool, 4 rows then Show 4 more, See all link', async () => {
    await show()
    const sec = screen.getByTestId('dc-top-story')
    expect(within(sec).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('#discover/watch')
    const hero = screen.getByTestId('dc-hero')
    expect(hero.className).toContain('md-hero')
    expect(idOf(pics(hero)[0]!)).toBe('qdbieBBd-Ko')
    expect(hero.getAttribute('href')).toBe('#discover/watch')
    expect(hero.getAttribute('aria-label')).toBe('Video, Automated furrow irrigation for sugarcane (in Filipino), Agribusiness How It Works')
    const rows = screen.getByTestId('dc-top-rows')
    expect(pics(rows).map(idOf)).toEqual(['hHYxtgCasGE', 'gfweUKAwvDc', 'eKkd-FxQ3_o', 'h9K9vH-JeZ8'])
    expect(rows.querySelectorAll('a.md-row')).toHaveLength(4)
    fireEvent.click(within(rows).getByRole('button', { name: 'Show 4 more' }))
    expect(pics(rows).map(idOf)).toEqual(['hHYxtgCasGE', 'gfweUKAwvDc', 'eKkd-FxQ3_o', 'h9K9vH-JeZ8', 'hHLJiEbjWfA', 'XQascgMHres', 'YKal0IwqArc', '--3VleyQw8o'])
    expect(within(rows).queryByRole('button', { name: /Show .* more/ })).toBeNull()
  })
  it('no category chip or channel tag on the cards (S28), only the title, channel and length', async () => {
    const { container } = await show()
    expect(container.querySelector('.dc-hchip, .dc-vc-tag, .dc-vc-k, .nw-chip')).toBeNull()
    expect(screen.getByTestId('dc-hero').querySelector('.md-flag')).toBeNull()
  })
  it('the same day gives the same order on every open (no reshuffle, even when the family counts change), and the next day changes it', async () => {
    const first = await show()
    const ids = () => pics(screen.getByTestId('dc-top-story')).map(idOf)
    const a = ids()
    first.unmount()
    ev.family = { watch_ch_raffy_s_green_thumb: 9, watch_ch_gma_news: 4 } // new taps arrive during the day: the order must not move
    localStorage.setItem('dc.watchcounts', JSON.stringify({ hHLJiEbjWfA: 9 }))
    await show(new Date(2026, 9, 28, 23, 50))
    expect(ids()).toEqual(a)
    cleanup()
    await show(new Date(2026, 9, 29, 0, 20))
    expect(ids()[0]).not.toBe(a[0]) // the next day ranks again
  })
  it('the family counts are read once on the first open of the day; a read that found nothing is retried once on a later open, then not again', async () => {
    ev.family = {} // signed in, but no channel has 3 viewers yet: nothing known
    await show(); cleanup()
    expect(ev.rpcCalls).toBe(1)
    await show(); cleanup()
    await waitFor(() => expect(ev.rpcCalls).toBe(2)) // the one later retry
    await show(); cleanup()
    await new Promise((r) => setTimeout(r, 20))
    expect(ev.rpcCalls).toBe(2)
  })
  it('weighting 1: the family\'s counts put the most-watched channel first (hero), the next channel second', async () => {
    ev.family = { watch_ch_raffy_s_green_thumb: 5, watch_ch_gma_news: 2 }
    localStorage.setItem('dc.watchcounts', JSON.stringify({ hHLJiEbjWfA: 9 })) // this phone's own counts are ignored while the family has a signal
    await show()
    expect(idOf(pics(screen.getByTestId('dc-hero'))[0]!)).not.toBe('JkEJhm_ikc8') // the first open paints the day's turn and does not move when the family answer arrives
    cleanup()
    await waitFor(async () => expect((await db.kv.get('dc.topstories'))?.value).toMatchObject({ ok: true })) // the family order is stored for the next open
    await show()
    expect(idOf(pics(screen.getByTestId('dc-hero'))[0]!)).toBe('JkEJhm_ikc8') // Raffy's Green Thumb, the only video of that channel in today's turn
    expect(pics(screen.getByTestId('dc-top-rows')).map(idOf)[0]).toBe('3oRx8JDns2E') // GMA News next
  })
  it('weighting 2: no family counts, so this phone\'s own taps decide; weighting 3: none at all, today\'s turn', async () => {
    localStorage.setItem('dc.watchcounts', JSON.stringify({ hHLJiEbjWfA: 3 }))
    await show()
    expect(idOf(pics(screen.getByTestId('dc-hero'))[0]!)).toBe('hHLJiEbjWfA') // Agri-nihan leads
    expect(pics(screen.getByTestId('dc-top-rows')).map(idOf).slice(0, 2)).toEqual(['qdbieBBd-Ko', 'eKkd-FxQ3_o']) // then one from each other channel, in today's order
    cleanup()
    localStorage.clear()
    await db.kv.clear() // a new day
    ev.family = {} // a family with no taps is no signal either
    await show()
    expect(idOf(pics(screen.getByTestId('dc-hero'))[0]!)).toBe('qdbieBBd-Ko')
  })
  it('every picture is a still from i.ytimg.com with no referrer, sized and lazy, and nothing from YouTube loads before a tap', async () => {
    const { container } = await show()
    const imgs = Array.from(container.querySelectorAll('.md-pic img'))
    expect(imgs.length).toBe(15) // 1 hero + 4 rows + 4 Farming + 4 Listen + 2 recipe videos, counted by hand (each shelf shows 4 until Show more)
    imgs.forEach((img) => {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/mqdefault\.jpg$/)
      expect(img.getAttribute('alt')).toBe(''); expect(img.getAttribute('loading')).toBe('lazy')
      expect(img.getAttribute('width')).toBe('320'); expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    })
    expect(container.querySelector('iframe')).toBeNull()
  })
  it('tapping a card stores the video for Watch, counts the card and its channel; a new-tab click does nothing', async () => {
    await show()
    const a = screen.getByTestId('dc-hero')
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey']) { fireEvent.click(a, { [k]: true }); expect(sessionStorage.getItem('dc.watch')).toBeNull() }
    expect(ev.calls).toEqual([])
    fireEvent.click(a)
    expect(sessionStorage.getItem('dc.watch')).toBe('qdbieBBd-Ko')
    fireEvent.click(screen.getByTestId('dc-top-rows').querySelectorAll('a')[2]!)
    expect(sessionStorage.getItem('dc.watch')).toBe('eKkd-FxQ3_o')
    expect(ev.calls).toEqual(['card_top_story', 'watch_ch_agribusiness_how_it_works', 'card_top_story', 'watch_ch_agree_sa_agri'])
    expect(JSON.parse(localStorage.getItem('dc.watchcounts')!)).toEqual({ 'qdbieBBd-Ko': 1, 'eKkd-FxQ3_o': 1 })
  })
  it('every video card has a play circle and is named "Video, title, channel, length" (length left out when not recorded)', async () => {
    await show()
    const cards = screen.getAllByTestId('dc-vcard')
    expect(cards.length).toBeGreaterThan(10)
    cards.forEach((c) => {
      expect(c.querySelector('.md-play')).toBeTruthy()
      const len = c.querySelector('.md-len')?.textContent
      const base = `Video, ${c.querySelector('.md-title')!.textContent}, ${c.querySelector('.md-meta')!.textContent}`
      expect(c.getAttribute('aria-label')).toBe(len ? `${base}, ${len.replace(' min', '')} minutes` : base)
    })
  })
  it('sections are not cards and the cards are separated: a section gap, a card gap, shadow and no border', async () => {
    const { container } = await show()
    expect(container.querySelector('section.sec.card, section.sec .md .md, .md .md')).toBeNull()
    expect(css).toMatch(/\.dc-panel \{[^}]*gap: var\(--sp-5, 24px\)/) // one 24 px step between sections (a margin on top of the gap made 46)
    expect(discoverCss).toMatch(/\.dc-stack \{[^}]*gap: var\(--card-gap, 12px\)/)
    expect(mediaCss).toMatch(/\.md-list \{[^}]*gap: var\(--card-gap, 12px\)/)
    expect(mediaCss).toMatch(/\.md \{[^}]*border: 0[^}]*box-shadow: var\(--shadow-raised/)
  })
})

describe('Health pointer and Farming and DIY shelf', () => {
  it('Health videos left Discover: no Health shelf, one link card that goes to Health', async () => {
    await show()
    expect(screen.queryByTestId('dc-health')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).not.toContain('Health videos')
    const link = screen.getByTestId('dc-health-link')
    expect(link.textContent).toBe('Health videos are in Health')
    expect(link.getAttribute('href')).toBe('#health')
  })
  it('Farming and DIY: cards not already in Top stories, 4 then Show more (4 at a time), each names its channel and opens Watch, link says All 23', async () => {
    await show()
    const row = screen.getByTestId('dc-farm-row')
    const cards = () => Array.from(row.querySelectorAll('a.md'))
    expect(pics(row).map(idOf)).toEqual(['zMH61Yabdj0', 'PLGmTzEGSIY', '7ePc9cz__FM', 'D32Hay6IQQQ']) // no watch counts yet: the shelf's own order, the 9 Top stories left out (23 - 9 = 14)
    expect(row.querySelector('.md-flag')).toBeNull()
    expect(cards()).toHaveLength(4)
    expect(cards()[1]!.querySelector('.md-meta')!.textContent).toBe('Ask This Old House')
    cards().forEach((c) => expect(c.getAttribute('href')).toBe('#discover/watch'))
    fireEvent.click(within(row).getByRole('button', { name: 'Show 4 more' }))
    expect(cards()).toHaveLength(8)
    fireEvent.click(cards()[0]!)
    expect(tracked()).toEqual(['card_farm_video'])
    expect(ev.calls).toContain('watch_ch_this_old_house')
    expect(within(screen.getByTestId('dc-farm')).getByRole('link', { name: 'All 23' }).getAttribute('href')).toBe('#discover/learn/farm-diy') // 23 farm-diy videos counted by hand in ready.json
  })
  it('one labelled Channel menu (default All channels) narrows the shelf to one channel; picking All channels shows all again', async () => {
    await show()
    expect(screen.queryByRole('group', { name: 'Farming and DIY channels' })).toBeNull()
    const sel = screen.getByLabelText('Channel') as HTMLSelectElement
    expect(sel.value).toBe('')
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['All channels', 'This Old House', 'Ask This Old House', 'The Home Depot', 'Agribusiness How It Works', 'Agree sa Agri', 'Agri-nihan', 'Don Bustamante Rooftop Gardening', 'The Agrillenial', "Raffy's Green Thumb"])
    fireEvent.change(sel, { target: { value: 'Agri-nihan' } })
    const metas = () => Array.from(screen.getByTestId('dc-farm').querySelectorAll('.md-meta')).map((k) => k.textContent)
    expect(metas()).toEqual(['Agri-nihan', 'Agri-nihan', 'Agri-nihan', 'Agri-nihan']) // all 4 Agri-nihan videos in ready.json, even those in Top stories
    expect(within(screen.getByTestId('dc-farm')).queryByRole('button', { name: /Show .* more/ })).toBeNull()
    fireEvent.change(sel, { target: { value: '' } })
    expect(metas()[0]).toBe('This Old House')
  })
  it('the most-tapped video on this phone comes first, with a Most watched label', async () => {
    localStorage.setItem('dc.watchcounts', JSON.stringify({ rgQyZX1sg38: 5 }))
    await show()
    const row = screen.getByTestId('dc-farm-row')
    expect(pics(row).map(idOf)[0]).toBe('rgQyZX1sg38') // This Old House leads Top stories with zMH61Yabdj0 (its first in today's turn), so its other tapped video is first on this shelf
    expect(row.querySelector('.md-flag')!.textContent).toBe('Most watched')
    expect(row.querySelector('a.md')!.getAttribute('aria-label')).toMatch(/^Video, Most watched, /) // the tag is in the accessible name
    fireEvent.click(row.querySelector('a.md')!)
    expect(JSON.parse(localStorage.getItem('dc.watchcounts')!).rgQyZX1sg38).toBe(6)
  })
  it('no side-swipe row is left on Discover Today', async () => {
    const { container } = await show()
    expect(container.querySelector('.carousel, .dc-posters, .dc-vrow, .dc-prep')).toBeNull()
  })
})

describe('Learn', () => {
  const cards = () => Array.from(screen.getByTestId('dc-learn').querySelectorAll('a.dc-lc')).map((c) => [c.querySelector('.dc-lc-t')!.textContent, c.getAttribute('href'), c.getAttribute('data-tint')])
  it('four tinted cards onto Learn topics, each with a drifting blob, All topics link', async () => {
    await show()
    const sec = screen.getByTestId('dc-learn')
    expect(within(sec).getByRole('link', { name: 'All topics' }).getAttribute('href')).toBe('#discover/learn')
    expect(cards()).toEqual([
      ['Health topics', '#health/library', 'purple'], ['Be prepared', '#discover/learn/prepping', 'amber'],
      ['Garden and farm', '#discover/learn/farm-diy', 'green'], ['Low-salt recipes', '#discover/learn/recipes', 'teal']
    ])
    expect(sec.querySelectorAll('.dc-lc-blob')).toHaveLength(4)
    expect(screen.getByTestId('dc-learn-recipes').textContent).toContain(RECIPES.length + ' low-salt recipes')
    expect(screen.getByTestId('dc-learn-farm').textContent).toContain('23 videos · 5 reads') // counted by hand in ready.json
  })
  it('the blobs drift slowly and stand still under reduced motion', () => {
    expect(css).toMatch(/\.dc-lc-blob\s*\{[^}]*animation:\s*dc-drift 14s/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*\.dc-lc-blob[^}]*animation:\s*none/)
  })
  it('Medicines takes the fourth place when the flag is on', async () => {
    await db.kv.put({ key: 'learn.medcards', value: true })
    await show()
    await waitFor(() => expect(cards()[3]).toEqual(['Medicines', '#discover/learn/meds', 'teal']))
    expect(cards()).toHaveLength(4)
  })
})

describe('Listen', () => {
  it('one large guided video (a play button naming it, big title, channel), All 7, then the other six as 4 cards and Show more', async () => {
    const { container } = await show()
    const sec = screen.getByTestId('dc-listen')
    expect(within(sec).getByRole('link', { name: 'All 7' }).getAttribute('href')).toBe('#discover/listen')
    expect(within(sec).getByRole('button', { name: /^Play Sleep talk down: guided sleep meditation/ })).toBeTruthy()
    const radio = screen.getByTestId('dc-radio-link')
    expect(radio.textContent).toBe('Philippine radio: music, pop and news')
    expect(radio.getAttribute('href')).toBe('#discover/listen/radio')
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-t')!.textContent).toBe('Sleep talk down: guided sleep meditation')
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-s')!.textContent).toContain('Jason Stephenson')
    expect(pics(screen.getByTestId('dc-listen-row')).map(idOf)).toEqual(['T4T8ACMXGGM', 'wCy2ETwUn3o', 'tEmt1Znux58', '2Q5T4uceQL8'])
    expect(within(screen.getByTestId('dc-listen-row')).getByRole('button', { name: 'Show 2 more' })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull() // plays only after a tap
  })
})

describe('Recipes', () => {
  it('two-column photo cards; ones with a photo first, each with its credit and licence under the photo', async () => {
    await show()
    const cards = Array.from(screen.getByTestId('dc-recipes').querySelectorAll('[data-testid="dc-recipe"]'))
    expect(cards).toHaveLength(4)
    const withPhoto = RECIPES.filter((r) => r.image)
    expect(withPhoto.length).toBeGreaterThanOrEqual(4)
    cards.forEach((c, i) => {
      const r = withPhoto[i]!
      expect(c.querySelector('.dc-rcard-t')!.textContent).toBe(r.name)
      expect(c.querySelector('.dc-rcard-t')!.getAttribute('href')).toBe('#discover/learn/recipe/' + r.id)
      const img = c.querySelector('img')!
      expect(img.getAttribute('src')).toBe(r.image!.url); expect(img.getAttribute('loading')).toBe('lazy'); expect(img.getAttribute('width')).toBe('500'); expect(img.getAttribute('height')).toBe('375')
      const credit = c.querySelector('.dc-credit')!
      expect(credit.textContent).toContain(r.image!.credit); expect(credit.textContent).toContain(r.image!.licence)
      expect(credit.querySelector('a')!.getAttribute('href')).toBe(r.image!.sourceUrl)
    })
  })
  it('after the app recipes come two recipe videos with the salt reminder', async () => {
    await show()
    const sec = screen.getByTestId('dc-recipes')
    const apps = Array.from(sec.querySelectorAll('.dc-rgrid [data-testid="dc-recipe"]'))
    expect(apps).toHaveLength(4)
    const vids = Array.from(screen.getByTestId('dc-recipe-videos').querySelectorAll('a.md'))
    expect(vids).toHaveLength(2)
    vids.forEach((v) => { expect(v.querySelector('.md-line')!.textContent).toBe('Tip: use less patis and salt') })
    expect(pics(sec).map(idOf)).toEqual(['27baGt4-kzg', 'pEMMBceYyMw']) // 20754 mod 5 recipe videos = 4: the 5th, then the 1st
  })
  it('every photo in recipes.json has a Commons file page link and a licence that allows reuse', () => {
    for (const r of RECIPES.filter((x) => x.image)) {
      expect(r.image!.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(r.image!.licence).toMatch(/^(CC0|CC BY \d\.\d|CC BY-SA \d\.\d|Public domain)$/)
      expect(r.image!.credit.length).toBeGreaterThan(1)
    }
  })
  it('a recipe with no photo keeps a coloured tile and no credit line', async () => {
    vi.resetModules()
    vi.doMock('./learn/data', async (orig) => ({ ...(await orig<typeof import('./learn/data')>()), RECIPES: [{ ...RECIPES[0]!, image: undefined }] }))
    const { default: Fresh } = await import('./Overview')
    render(<Fresh now={now} />)
    const c = screen.getByTestId('dc-recipe')
    expect(c.querySelector('img')).toBeNull(); expect(c.querySelector('.dc-credit')).toBeNull()
    expect(c.querySelector('.dc-rphoto')!.getAttribute('data-fallback')).toBe('true')
    vi.doUnmock('./learn/data'); vi.resetModules()
  })
})

describe('Play and Did you know', () => {
  it('two game cards with deep links', async () => {
    await show()
    const sec = screen.getByTestId('dc-play')
    expect(within(sec).getByRole('link', { name: 'All games' }).getAttribute('href')).toBe('#discover/play')
    expect(Array.from(sec.querySelectorAll('a.pt')).map((c) => c.getAttribute('href'))).toEqual(['#discover/play/memory', '#discover/play/wordsearch'])
  })
  it('the fact of the day opens the fun facts', async () => {
    await show()
    const f = screen.getByTestId('dc-fact')
    expect(f.querySelector('.dc-fact-t')!.textContent).toBe(phFactOf(dayKey(now)))
    expect(f.getAttribute('href')).toBe('#discover/play/facts')
  })
})

describe('News view', () => {
  const rows = [
    row('h', { source: 'DOH', topic: 'health', published_at: '2026-10-28T06:00:00Z', image_url: 'https://img.test/h.jpg' }),
    row('p', { source: 'PAGASA', topic: 'prepping', published_at: '2026-10-28T05:00:00Z' }),
    row('n', { source: 'PNA', topic: 'national', published_at: '2026-10-28T08:00:00Z' }),
    row('u', { source: 'GMA', published_at: '2026-10-28T09:00:00Z' }),
    row('e1', { source: 'GMA', published_at: '2026-10-28T04:00:00Z' }),
    row('e2', { source: 'GMA', published_at: '2026-10-28T03:00:00Z' })
  ]
  it('six chips; Top leads with prepping then health, Latest is newest first, every card names its source', async () => {
    feed(rows)
    await show()
    fireEvent.click(tab('News'))
    const chips = await screen.findByRole('group', { name: 'News topics' })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Top', 'Latest', 'Prepping', 'Health', 'National', 'Wellbeing'])
    const lead = screen.getByTestId('nw-lead')
    expect(lead.textContent).toContain('Headline p'); expect(lead.textContent).toContain('PAGASA') // prepping first
    const stories = Array.from(screen.getByRole('region', { name: 'Top stories' }).querySelectorAll('[data-testid="nw-story"]'))
    expect(stories.map((a) => a.querySelector('.nw-title')!.textContent)).toEqual(['Headline h (opens the news site)', 'Headline n (opens the news site)', 'Headline u (opens the news site)'])
    stories.forEach((a) => expect(a.querySelector('.nw-src')!.textContent!.length).toBeGreaterThan(0))
    const latest = Array.from(screen.getByRole('region', { name: 'Latest' }).querySelectorAll('.nw-title')).map((t) => t.textContent!.replace(' (opens the news site)', ''))
    expect(latest).toEqual(['Headline e1', 'Headline e2']) // the lead and the three Top stories are not shown again
    expect(screen.getByRole('region', { name: 'Official bulletins' })).toBeTruthy()
  })
  it('a topic chip shows only that topic; an empty topic says so; the row without a picture gets the initial tile', async () => {
    feed(rows)
    await show()
    fireEvent.click(tab('News'))
    fireEvent.click(await screen.findByRole('button', { name: 'Health' }))
    expect(screen.getByRole('button', { name: 'Health' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('nw-lead').textContent).toContain('Headline h')
    expect(screen.getByTestId('nw-lead').querySelector('img')!.getAttribute('src')).toBe('https://img.test/h.jpg')
    expect(screen.queryByTestId('nw-story')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Wellbeing' }))
    expect(screen.getByText('No wellbeing stories yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    const first = screen.getAllByTestId('nw-latest')[0]!
    expect(first.querySelector('.nw-title')!.textContent).toContain('Headline u')
  })
  it('Read later is a 44 px button with an aria-label', async () => {
    feed(rows)
    await show()
    fireEvent.click(tab('News'))
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    const b = within(await screen.findByRole('region', { name: 'Latest' })).getAllByRole('button')[0]!
    expect(b.className).toBe('nw-save') // .nw-save is 44 x 44 in today.css
    expect(b.getAttribute('aria-label')).toBe('Read later: Headline u')
  })
})

describe('Saved (read later)', () => {
  it('Read later on a Latest row puts it in Saved; the same button there takes it off', async () => {
    feed([row('a', { source: 'WHO' }), row('b', { source: 'DOH', published_at: '2026-10-28T08:00:00Z' })])
    await show()
    fireEvent.click(tab('News'))
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    const latest = await screen.findByRole('region', { name: 'Latest' })
    const btn = within(latest).getAllByRole('button')[0]!
    expect(btn.getAttribute('aria-label')).toContain('Read later')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(tab('Saved'))
    const saved = await screen.findByTestId('dc-saved')
    expect(saved.querySelectorAll('[data-testid="nw-latest"]')).toHaveLength(1)
    expect(saved.textContent).toContain('Headline a')
    fireEvent.click(within(saved).getByRole('button'))
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('bantay.discover.saved')!)).toEqual([])
  })
  it('private-mode storage that throws does not break the screen', async () => {
    feed([row('a')])
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await show()
    fireEvent.click(tab('News'))
    fireEvent.click(await screen.findByRole('button', { name: 'Latest' }))
    const latest = await screen.findByRole('region', { name: 'Latest' })
    expect(() => fireEvent.click(within(latest).getAllByRole('button')[0]!)).not.toThrow()
    fireEvent.click(tab('Saved'))
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy()
    get.mockRestore(); set.mockRestore()
  })
})

describe('S24 fix round 1', () => {
  it('Learn blobs are a darker hue of each tint (not the card colour)', () => {
    expect(css).toMatch(/\.dc-lc-blob \{[^}]*opacity: \.35;[^}]*--blob: color-mix\(in srgb, var\(--tint-ink\)/)
    expect(css).not.toMatch(/\.dc-lc-blob \{[^}]*var\(--card\)/)
  })
  it('the old Ken Burns zoom and the dead video-card rules are gone (nothing moves on its own on the video cards)', () => {
    expect(css).not.toMatch(/dc-kb|dc-still/)
    expect(discoverCss).not.toMatch(/\.dc-vc|\.dc-still|\.dc-poster|\.dc-herocard|\.dc-hero-/)
  })
})
