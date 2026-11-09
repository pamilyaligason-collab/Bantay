import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeed } from './news/Screen'
import type { NewsRow } from './news/model'
import { db } from '../../db'
import { RECIPES } from './learn/data'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import css from './today.css?raw'
import discoverCss from './discover.css?raw'
import Overview from './Overview'

const ev = vi.hoisted(() => ({ calls: [] as string[], news: null as null | { rows: Record<string, string>[]; fetchedAt: number | null } }))
vi.mock('../admin/events', () => ({ track: async (_k: string, n: string) => { ev.calls.push(n); return true } }))
vi.mock('./newsvideo/api', async (orig) => ({ ...(await orig<typeof import('./newsvideo/api')>()), useNewsVideos: () => ev.news }))
vi.mock('./news/Screen', async (orig) => ({ ...(await orig<typeof import('./news/Screen')>()), useNewsZone: () => null, loadFeed: vi.fn() }))
const row = (id: string, o: Partial<NewsRow> = {}): NewsRow => ({ id, title: 'Headline ' + id, url: 'https://news.test/' + id, source: 'PNA', kind: 'article', published_at: '2026-10-28T09:20:00Z', zone: null, ...o })
const feed = (items: NewsRow[] | null) => vi.mocked(loadFeed).mockResolvedValue({ items, savedAt: null, offline: false })

beforeEach(async () => { ev.calls.length = 0; ev.news = null; feed([]); location.hash = '#discover'; sessionStorage.clear(); localStorage.clear(); await db.kv.clear() })
afterEach(cleanup)

const now = new Date(2026, 9, 28, 10, 20)
const tab = (name: string) => screen.getByRole('tab', { name })

describe('head and the Today | News | Saved control', () => {
  it('draws the large title with the kicker and a search button', () => {
    render(<Overview now={now} />)
    const head = screen.getByTestId('dc-head')
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(head.querySelector('.lt-kicker')!.textContent).toBe('Learn, watch, play')
    expect(screen.getByTestId('dc-search').getAttribute('href')).toBe('#health/library') // S25: the library moved into Health
  })
  it('is a tablist of three tabs, Today selected, one tabpanel labelled by the selected tab', () => {
    render(<Overview now={now} />)
    expect(screen.getByRole('tablist', { name: 'Discover views' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([['Today', 'true'], ['News', 'false'], ['Saved', 'false']])
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Today').id)
    expect(tab('Today').getAttribute('aria-controls')).toBe(panel.id)
    expect(tab('News').getAttribute('tabindex')).toBe('-1')
  })
  it('a click or an arrow key moves the selection and the panel follows; Home and End jump', async () => {
    render(<Overview now={now} />)
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
  it('Learn, Top stories, Farming and DIY, Regional news, Listen, then the rest (Health pointer, Recipes, Play, Did you know)', () => {
    ev.news = { rows: [{ video_id: 'abcdefghijk', channel_id: 'c', channel: 'GMA News', title: 'Story one', published_at: '2026-10-28T09:00:00Z' }], fetchedAt: null }
    render(<Overview now={now} />)
    const ids = ['dc-learn', 'dc-top-story', 'dc-farm', 'dc-regional', 'dc-listen', 'dc-health-link', 'dc-recipes', 'dc-play', 'dc-fact']
    const els = ids.map((i) => screen.getByTestId(i))
    els.slice(1).forEach((e, i) => expect(els[i]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Learn', 'Top stories', 'Farming and DIY', 'Regional news', 'Listen', 'Recipes', 'Play'])
  })
  it('no news headline and no season row on Today: the news lives on the Today tab (D-142); the News tab stays', async () => {
    feed([row('a')])
    render(<Overview now={now} />)
    expect(screen.queryByTestId('dc-lead')).toBeNull()
    expect(screen.queryByTestId('season-row')).toBeNull()
    expect(screen.queryByText(/All news/)).toBeNull()
    fireEvent.click(tab('News'))
    expect(await screen.findByRole('group', { name: 'News topics' })).toBeTruthy()
  })
})

const idOf = (img: Element) => /vi\/([\w-]{11})\//.exec(img.getAttribute('src')!)![1]
const pics = (el: Element) => Array.from(el.querySelectorAll('.dc-still img'))

describe('Top stories (prepping videos)', () => {
  // 28 Oct 2026 is day 20754 since 1970; 20754 mod 20 prepping videos = 14, so the turn starts at the 15th video (counted by hand from ready.json)
  it('one hero card, two half cards and two wide rows from today\'s five prepping videos, All prepping link', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-top-story')
    expect(within(sec).getByRole('link', { name: 'All prepping' }).getAttribute('href')).toBe('#discover/learn/prepping')
    const hero = screen.getByTestId('dc-hero')
    expect(idOf(pics(hero)[0]!)).toBe('7WxUgGfiHb4')
    expect(hero.querySelector('.dc-hchip')!.textContent).toBe('Prepping · Knowledge Channel')
    expect(hero.getAttribute('href')).toBe('#discover/watch')
    const grid = screen.getByTestId('dc-top-grid')
    expect(grid.querySelectorAll('a.dc-vgcard')).toHaveLength(2)
    expect(pics(grid).map(idOf)).toEqual(['IEN3GJap2Kc', '3oRx8JDns2E'])
    const rows = screen.getByTestId('dc-top-rows')
    expect(rows.querySelectorAll('a.dc-vwide')).toHaveLength(2)
    expect(pics(rows).map(idOf)).toEqual(['fmJlnEExTvg', '7Ogz8BQ_nX0'])
    expect(discoverCss).toMatch(/\.card\.dc-herocard \{ box-shadow: var\(--shadow-hero\)/)
    expect(discoverCss).toMatch(/\.card\.dc-vc, \.card\.dc-lc, \.card\.nv-card \{ box-shadow: var\(--shadow-raised\)/)
  })
  it('every picture is a still from i.ytimg.com with no referrer, sized and lazy, and nothing from YouTube loads before a tap', () => {
    const { container } = render(<Overview now={now} />)
    const imgs = Array.from(container.querySelectorAll('.dc-still img'))
    expect(imgs.length).toBe(16) // 1 hero + 2 half + 2 wide + 1 lead and 4 Farming + 4 Listen + 2 recipe videos, counted by hand (each shelf shows 4 until Show more)
    imgs.forEach((img) => {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/mqdefault\.jpg$/)
      expect(img.getAttribute('alt')).toBe(''); expect(img.getAttribute('loading')).toBe('lazy')
      expect(img.getAttribute('width')).toBe('320'); expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    })
    expect(container.querySelector('iframe')).toBeNull()
  })
  it('the still zooms slowly (Ken Burns) and stops under reduced motion', () => {
    expect(css).toMatch(/\.dc-still img\s*\{[^}]*animation:\s*dc-kb 18s/)
    expect(css).toMatch(/@keyframes dc-kb/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*\.dc-still img[^}]*animation:\s*none/)
  })
  it('tapping a card stores the video for Watch; a new-tab click does not', () => {
    render(<Overview now={now} />)
    const a = screen.getByTestId('dc-hero')
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey']) { fireEvent.click(a, { [k]: true }); expect(sessionStorage.getItem('dc.watch')).toBeNull() }
    fireEvent.click(a)
    expect(sessionStorage.getItem('dc.watch')).toBe('7WxUgGfiHb4')
    fireEvent.click(screen.getByTestId('dc-top-grid').querySelectorAll('a')[1]!)
    expect(sessionStorage.getItem('dc.watch')).toBe('3oRx8JDns2E')
    expect(ev.calls).toEqual(['card_top_story', 'card_top_story']) // the two plain taps; the three modified clicks are not counted
  })
  it('every video card has a play circle and is named "Video, title, channel, length" (length left out when not recorded)', () => {
    render(<Overview now={now} />)
    const cards = screen.getAllByTestId('dc-vcard')
    expect(cards.length).toBeGreaterThan(10)
    cards.forEach((c) => {
      expect(c.querySelector('.dc-vc-play')).toBeTruthy()
      expect(c.getAttribute('aria-label')).toBe(`Video, ${c.querySelector('.dc-vc-t')!.textContent}, ${c.querySelector('.dc-vc-k')!.textContent}`)
    })
    expect(screen.getByTestId('dc-hero').getAttribute('aria-label')).toMatch(/^Video, .+, Knowledge Channel/)
  })
})

describe('Health pointer and Farming and DIY shelf', () => {
  it('Health videos left Discover: no Health shelf, one link card that goes to Health', () => {
    render(<Overview now={now} />)
    expect(screen.queryByTestId('dc-health')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).not.toContain('Health videos')
    const link = screen.getByTestId('dc-health-link')
    expect(link.textContent).toBe('Health videos are in Health')
    expect(link.getAttribute('href')).toBe('#health')
  })
  it('Farming and DIY: a lead card, 4 cards then Show more (4 at a time), every card names its channel and opens Watch, link says All 23', () => {
    render(<Overview now={now} />)
    const row = screen.getByTestId('dc-farm-row')
    const cards = () => Array.from(row.querySelectorAll('a.dc-vgcard'))
    const lead = screen.getByTestId('dc-farm').querySelector('a.dc-vlead')!
    expect(pics(lead.parentElement!).map(idOf)).toEqual(['zMH61Yabdj0']) // no watch counts yet: the first (newest) video leads
    expect(lead.querySelector('.dc-vc-tag')).toBeNull()
    expect(cards()).toHaveLength(4)
    expect(cards()[0]!.querySelector('.dc-vc-k')!.textContent).toBe('Ask This Old House')
    cards().forEach((c) => expect(c.getAttribute('href')).toBe('#discover/watch'))
    fireEvent.click(within(row).getByRole('button', { name: 'Show 4 more' }))
    expect(cards()).toHaveLength(8)
    fireEvent.click(cards()[0]!)
    expect(ev.calls).toEqual(['card_farm_video'])
    expect(within(screen.getByTestId('dc-farm')).getByRole('link', { name: 'All 23' }).getAttribute('href')).toBe('#discover/learn/farm-diy') // 23 farm-diy videos counted by hand in ready.json
  })
  it('one labelled Channel menu (default All channels) narrows the shelf to one channel; picking All channels shows all again', () => {
    render(<Overview now={now} />)
    expect(screen.queryByRole('group', { name: 'Farming and DIY channels' })).toBeNull()
    const sel = screen.getByLabelText('Channel') as HTMLSelectElement
    expect(sel.value).toBe('')
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['All channels', 'This Old House', 'Ask This Old House', 'The Home Depot', 'Agribusiness How It Works', 'Agree sa Agri', 'Agri-nihan', 'Don Bustamante Rooftop Gardening', 'The Agrillenial', "Raffy's Green Thumb"])
    fireEvent.change(sel, { target: { value: 'Agri-nihan' } })
    const kickers = () => Array.from(screen.getByTestId('dc-farm').querySelectorAll('.dc-vc-k')).map((k) => k.textContent)
    expect(kickers()).toEqual(['Agri-nihan', 'Agri-nihan', 'Agri-nihan', 'Agri-nihan']) // 4 Agri-nihan videos in ready.json: the lead and three cards
    expect(within(screen.getByTestId('dc-farm')).queryByRole('button', { name: /Show .* more/ })).toBeNull()
    fireEvent.change(sel, { target: { value: '' } })
    expect(kickers()[0]).toBe('This Old House')
  })
  it('the most-tapped video on this phone leads, with a Most watched label', () => {
    localStorage.setItem('dc.watchcounts', JSON.stringify({ hHLJiEbjWfA: 3, PLGmTzEGSIY: 1 }))
    render(<Overview now={now} />)
    const lead = screen.getByTestId('dc-farm').querySelector('a.dc-vlead')!
    expect(pics(lead.parentElement!).map(idOf)).toEqual(['hHLJiEbjWfA'])
    expect(lead.querySelector('.dc-vc-tag')!.textContent).toBe('Most watched')
    fireEvent.click(lead)
    expect(JSON.parse(localStorage.getItem('dc.watchcounts')!).hHLJiEbjWfA).toBe(4)
  })
  it('no side-swipe row is left on Discover Today', () => {
    const { container } = render(<Overview now={now} />)
    expect(container.querySelector('.carousel, .dc-posters, .dc-vrow, .dc-prep')).toBeNull()
  })
})

describe('Learn', () => {
  const cards = () => Array.from(screen.getByTestId('dc-learn').querySelectorAll('a.dc-lc')).map((c) => [c.querySelector('.dc-lc-t')!.textContent, c.getAttribute('href'), c.getAttribute('data-tint')])
  it('four tinted cards onto Learn topics, each with a drifting blob, All topics link', () => {
    render(<Overview now={now} />)
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
    render(<Overview now={now} />)
    await waitFor(() => expect(cards()[3]).toEqual(['Medicines', '#discover/learn/meds', 'teal']))
    expect(cards()).toHaveLength(4)
  })
})

describe('Listen', () => {
  it('one large guided video (a play button naming it, big title, channel), All 7, then the other six as 4 cards and Show more', () => {
    const { container } = render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-listen')
    expect(within(sec).getByRole('link', { name: 'All 7' }).getAttribute('href')).toBe('#discover/listen')
    expect(within(sec).getByRole('button', { name: /^Play Sleep talk down: guided sleep meditation/ })).toBeTruthy()
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-t')!.textContent).toBe('Sleep talk down: guided sleep meditation')
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-s')!.textContent).toContain('Jason Stephenson')
    expect(pics(screen.getByTestId('dc-listen-row')).map(idOf)).toEqual(['T4T8ACMXGGM', 'wCy2ETwUn3o', 'tEmt1Znux58', '2Q5T4uceQL8'])
    expect(within(screen.getByTestId('dc-listen-row')).getByRole('button', { name: 'Show 2 more' })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull() // plays only after a tap
  })
})

describe('Recipes', () => {
  it('two-column photo cards; ones with a photo first, each with its credit and licence under the photo', () => {
    render(<Overview now={now} />)
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
  it('after the app recipes come two recipe videos with the salt reminder', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-recipes')
    const all = Array.from(sec.querySelectorAll('.dc-rgrid [data-testid="dc-recipe"], .dc-rgrid a.dc-vgcard'))
    expect(all).toHaveLength(6)
    const vids = all.slice(4)
    vids.forEach((v) => { expect(v.matches('a.dc-vgcard')).toBe(true); expect(v.querySelector('.dc-vc-n')!.textContent).toBe('Tip: use less patis and salt') })
    expect(all.slice(0, 4).every((c) => c.matches('[data-testid="dc-recipe"]'))).toBe(true)
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
  it('two game cards with deep links', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-play')
    expect(within(sec).getByRole('link', { name: 'All games' }).getAttribute('href')).toBe('#discover/play')
    expect(Array.from(sec.querySelectorAll('a.pt')).map((c) => c.getAttribute('href'))).toEqual(['#discover/play/memory', '#discover/play/wordsearch'])
  })
  it('the fact of the day opens the fun facts', () => {
    render(<Overview now={now} />)
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
    render(<Overview now={now} />)
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
    render(<Overview now={now} />)
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
    render(<Overview now={now} />)
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
    render(<Overview now={now} />)
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
    render(<Overview now={now} />)
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
  it('Learn blobs are a darker hue of each tint (not the card colour); green and amber video cards carry their tint', () => {
    expect(css).toMatch(/\.dc-lc-blob \{[^}]*opacity: \.35;[^}]*--blob: color-mix\(in srgb, var\(--tint-ink\)/)
    expect(css).not.toMatch(/\.dc-lc-blob \{[^}]*var\(--card\)/)
    expect(discoverCss).toMatch(/\.dc-vc\[data-tint="green"\] \{ --tint-fill: var\(--tint-green\); --tint-ink: var\(--tint-green-ink\); \}/)
    expect(discoverCss).toMatch(/\.dc-vc\[data-tint="amber"\] \{ --tint-fill: var\(--tint-amber\); --tint-ink: var\(--tint-amber-ink\); \}/)
  })
  it('the Ken Burns zoom of a card that scrolls off screen is paused, and resumes when it comes back', () => {
    const cbs: IntersectionObserverCallback[] = []
    vi.stubGlobal('IntersectionObserver', class { constructor(c: IntersectionObserverCallback) { cbs.push(c) } observe() {} disconnect() {} })
    render(<Overview now={now} />)
    expect(document.querySelectorAll('.dc-still.is-paused').length).toBe(0)
    const fire = (isIntersecting: boolean) => act(() => { cbs[0]!([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver) })
    fire(false)
    expect(document.querySelectorAll('.dc-still.is-paused').length).toBe(1)
    fire(true)
    expect(document.querySelectorAll('.dc-still.is-paused').length).toBe(0)
    vi.unstubAllGlobals()
    expect(css).toMatch(/\.dc-still\.is-paused img \{ animation-play-state: paused; \}/)
  })
})
