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
import Overview from './Overview'

vi.mock('./news/Screen', async (orig) => ({ ...(await orig<typeof import('./news/Screen')>()), useNewsZone: () => null, loadFeed: vi.fn() }))
const row = (id: string, o: Partial<NewsRow> = {}): NewsRow => ({ id, title: 'Headline ' + id, url: 'https://news.test/' + id, source: 'PNA', kind: 'article', published_at: '2026-10-28T09:20:00Z', zone: null, ...o })
const feed = (items: NewsRow[] | null) => vi.mocked(loadFeed).mockResolvedValue({ items, savedAt: null, offline: false })

beforeEach(async () => { feed([]); location.hash = '#discover'; sessionStorage.clear(); localStorage.clear(); await db.kv.clear() })
afterEach(cleanup)

const now = new Date(2026, 9, 28, 10, 20)
const tab = (name: string) => screen.getByRole('tab', { name })

describe('head and the Today | News | Saved control', () => {
  it('draws the large title with the kicker and a search button', () => {
    render(<Overview now={now} />)
    const head = screen.getByTestId('dc-head')
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(head.querySelector('.lt-kicker')!.textContent).toBe('Learn, watch, play')
    expect(screen.getByTestId('dc-search').getAttribute('href')).toBe('#discover/learn/library')
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
  it('Learn, Top story, Health videos, Farming and DIY, Listen, Recipes, Play, Did you know', () => {
    render(<Overview now={now} />)
    const ids = ['dc-learn', 'dc-top-story', 'dc-health', 'dc-farm', 'dc-listen', 'dc-recipes', 'dc-play', 'dc-fact']
    const els = ids.map((i) => screen.getByTestId(i))
    els.slice(1).forEach((e, i) => expect(els[i]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Learn', 'Top story', 'Health videos', 'Farming and DIY', 'Listen', 'Recipes', 'Play'])
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

describe('Top story (prepping videos)', () => {
  // 28 Oct 2026 is day 20754 since 1970; 20754 mod 17 prepping videos = 14, so the turn starts at the 15th video (counted by hand from ready.json)
  it('one large card and a 2 x 2 grid of today\'s five prepping videos, All prepping link', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-top-story')
    expect(within(sec).getByRole('link', { name: 'All prepping' }).getAttribute('href')).toBe('#discover/learn/prepping')
    const hero = screen.getByTestId('dc-hero')
    expect(idOf(pics(hero)[0]!)).toBe('7WxUgGfiHb4')
    expect(hero.querySelector('.dc-hchip')!.textContent).toBe('Prepping · Knowledge Channel')
    expect(hero.getAttribute('href')).toBe('#discover/watch')
    const grid = screen.getByTestId('dc-top-grid')
    expect(grid.querySelectorAll('a.dc-vgcard')).toHaveLength(4)
    expect(pics(grid).map(idOf)).toEqual(['IEN3GJap2Kc', '3oRx8JDns2E', 'oTyYzHntBxQ', 'NYRmHwmbhIk'])
  })
  it('every picture is a still from i.ytimg.com with no referrer, sized and lazy, and nothing from YouTube loads before a tap', () => {
    const { container } = render(<Overview now={now} />)
    const imgs = Array.from(container.querySelectorAll('.dc-still img'))
    expect(imgs.length).toBe(46) // 1 + 4 + 27 + 9 + 3 + 2, counted by hand
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
  })
})

describe('Health videos and Farming and DIY rows', () => {
  it('Health videos: newest first (the appended Philippine videos lead), every card names its channel and opens Watch', () => {
    render(<Overview now={now} />)
    const row = screen.getByTestId('dc-health-row')
    const cards = Array.from(row.querySelectorAll('a.dc-vrow'))
    expect(cards).toHaveLength(27) // 19 in videos.json plus 8 added in S24
    expect(idOf(cards[0]!.querySelector('img')!)).toBe('HhHTnDOtxe8')
    expect(cards[0]!.querySelector('.dc-vc-k')!.textContent).toBe('Department of Health (Philippines)')
    cards.forEach((c) => expect(c.getAttribute('href')).toBe('#discover/watch'))
  })
  it('channel chips narrow the row to one channel; a second tap shows all', () => {
    render(<Overview now={now} />)
    const group = screen.getByRole('group', { name: 'Health videos channels' })
    const mayo = within(group).getByRole('button', { name: 'Mayo Clinic' })
    expect(within(group).getByRole('button', { name: 'Doc Willie Ong' })).toBeTruthy()
    fireEvent.click(mayo)
    expect(mayo.getAttribute('aria-pressed')).toBe('true')
    const kickers = () => Array.from(screen.getByTestId('dc-health-row').querySelectorAll('.dc-vc-k')).map((k) => k.textContent)
    expect(kickers()).toHaveLength(8) // 4 Mayo Clinic videos before S24, 4 more added
    expect(new Set(kickers())).toEqual(new Set(['Mayo Clinic']))
    fireEvent.click(mayo)
    expect(kickers()).toHaveLength(27)
  })
  it('Farming and DIY: the nine farm and repair videos, chips for the four channels', () => {
    render(<Overview now={now} />)
    expect(screen.getByTestId('dc-farm-row').querySelectorAll('a.dc-vrow')).toHaveLength(9) // 6 moved from Repairs plus 3 added
    const chips = within(screen.getByRole('group', { name: 'Farming and DIY channels' })).getAllByRole('button').map((b) => b.textContent)
    expect(chips).toEqual(['This Old House', 'Ask This Old House', 'The Home Depot', 'Agribusiness How It Works'])
    expect(within(screen.getByTestId('dc-farm')).getByRole('link', { name: 'All' }).getAttribute('href')).toBe('#discover/learn/farm-diy')
  })
})

describe('Learn', () => {
  const cards = () => Array.from(screen.getByTestId('dc-learn').querySelectorAll('a.dc-lc')).map((c) => [c.querySelector('.dc-lc-t')!.textContent, c.getAttribute('href'), c.getAttribute('data-tint')])
  it('four tinted cards onto Learn topics, each with a drifting blob, All topics link', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-learn')
    expect(within(sec).getByRole('link', { name: 'All topics' }).getAttribute('href')).toBe('#discover/learn')
    expect(cards()).toEqual([
      ['Health topics', '#discover/learn/library', 'purple'], ['Be prepared', '#discover/learn/prepping', 'amber'],
      ['Garden and farm', '#discover/learn/farm-diy', 'green'], ['Low-salt recipes', '#discover/learn/recipes', 'teal']
    ])
    expect(sec.querySelectorAll('.dc-lc-blob')).toHaveLength(4)
    expect(screen.getByTestId('dc-learn-recipes').textContent).toContain(RECIPES.length + ' low-salt recipes')
    expect(screen.getByTestId('dc-learn-farm').textContent).toContain('9 videos · 5 reads') // counted by hand in ready.json
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
  it('one large guided video (a play button naming it, big title, channel), See all, then a row of the other three', () => {
    const { container } = render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-listen')
    expect(within(sec).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('#discover/listen')
    expect(within(sec).getByRole('button', { name: /^Play Sleep talk down: guided sleep meditation/ })).toBeTruthy()
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-t')!.textContent).toBe('Sleep talk down: guided sleep meditation')
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-s')!.textContent).toContain('Jason Stephenson')
    expect(pics(screen.getByTestId('dc-listen-row')).map(idOf)).toEqual(['T4T8ACMXGGM', 'wCy2ETwUn3o', 'tEmt1Znux58'])
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
