import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeed } from './news/Screen'
import type { NewsRow } from './news/model'
import { db } from '../../db'
import { RECIPES } from './learn/data'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import { CALM_VIDEOS } from '../calm/media'
import { READY_TOPICS, READY_VIDEOS } from './learn/ready'
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
  it('Top story, season, Watch, Learn, Listen, Recipes, Play', () => {
    render(<Overview now={now} />)
    const ids = ['dc-top-story', 'season-row', 'dc-watch', 'dc-learn', 'dc-listen', 'dc-recipes', 'dc-play', 'dc-fact']
    const els = ids.map((i) => screen.getByTestId(i))
    els.slice(1).forEach((e, i) => expect(els[i]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
  })
})

describe('Top story', () => {
  it('shows the newest row as a large card with its source, one more story, and All news opens the News view', async () => {
    feed([row('old', { source: 'DOH', published_at: '2026-10-28T01:00:00Z' }), row('new', { source: 'PAGASA', published_at: '2026-10-28T08:00:00Z' }), row('mid', { source: 'WHO', published_at: '2026-10-28T05:00:00Z' })])
    render(<Overview now={now} />)
    const lead = await screen.findByTestId('dc-lead')
    expect(lead.textContent).toContain('Headline new')
    expect(lead.textContent).toContain('PAGASA')
    expect(lead.getAttribute('href')).toBe('https://news.test/new')
    expect(lead.getAttribute('rel')).toBe('noopener noreferrer')
    const sec = screen.getByTestId('dc-top-story')
    expect(sec.querySelectorAll('[data-testid="nw-story"]').length).toBe(1)
    expect(sec.querySelector('[data-testid="nw-story"]')!.textContent).toContain('Headline mid')
    fireEvent.click(within(sec).getByRole('button', { name: /All news/ }))
    expect(tab('News').getAttribute('aria-selected')).toBe('true')
  })
  it('no picture or a null image_url: a coloured tile with the source initial, never an img', async () => {
    feed([row('a', { source: 'Rappler', image_url: null }), row('b', { source: 'GMA' })])
    render(<Overview now={now} />)
    const lead = await screen.findByTestId('dc-lead')
    const pic = lead.querySelector('.nw-lead-pic')!
    expect(pic.getAttribute('data-fallback')).toBe('true')
    expect(pic.querySelector('img')).toBeNull()
    expect(pic.textContent).toBe('R')
  })
  it('a picture loads lazily with its size set and no referrer; if it fails the tile takes over', async () => {
    feed([row('a', { source: 'Rappler', image_url: 'https://img.test/a.jpg' })])
    render(<Overview now={now} />)
    const lead = await screen.findByTestId('dc-lead')
    const img = lead.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://img.test/a.jpg')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('width')).toBe('358'); expect(img.getAttribute('height')).toBe('180')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.error(img)
    expect(lead.querySelector('img')).toBeNull()
    expect(lead.querySelector('.nw-mark')!.textContent).toBe('R')
  })
  it('an http (not https) picture is not loaded', async () => {
    feed([row('a', { image_url: 'http://img.test/a.jpg' })])
    render(<Overview now={now} />)
    expect((await screen.findByTestId('dc-lead')).querySelector('img')).toBeNull()
  })
  it('says so when the feed is empty or not connected', async () => {
    feed([])
    const { unmount } = render(<Overview now={now} />)
    expect(await screen.findByText('No headlines saved yet. They load when you have signal.')).toBeTruthy()
    unmount()
    feed(null)
    render(<Overview now={now} />)
    expect(await screen.findByText('The news feed is not connected yet.')).toBeTruthy()
  })
  it('reloads on bantay:refresh', async () => {
    feed([row('a')])
    render(<Overview now={now} />)
    await screen.findByText(/Headline a/)
    feed([row('z')])
    let done: Promise<unknown> = Promise.resolve()
    window.dispatchEvent(new CustomEvent('bantay:refresh', { detail: { waitUntil: (p: Promise<unknown>) => { done = p } } }))
    await done
    expect(await screen.findByText(/Headline z/)).toBeTruthy()
  })
})

describe('Watch', () => {
  it('one large main video that is prepping or health, then a row of two more main videos and one DIY, each opening Watch', () => {
    render(<Overview now={now} />)
    const hero = screen.getByTestId('dc-hero')
    expect(hero.hasAttribute('data-hero')).toBe(true)
    expect(hero.querySelector('.dc-hero-play')).toBeTruthy()
    expect(hero.querySelector('.dc-hchip')!.textContent).toMatch(/^(Prepping|Health) · \d+ checked videos$/)
    const cards = Array.from(screen.getByTestId('dc-videos').querySelectorAll('a.dc-vrow'))
    expect(cards).toHaveLength(3)
    expect(cards[2]!.querySelector('.dc-vc-k')!.textContent).toBe('DIY') // DIY follows the main videos
    expect(cards.slice(0, 2).map((c) => c.querySelector('.dc-vc-k')!.textContent)).not.toContain('DIY')
    cards.forEach((c) => expect(c.getAttribute('href')).toBe('#discover/watch'))
    const diyTopic = READY_TOPICS.find((t) => t.id === 'repairs')!.video
    expect(READY_VIDEOS.filter((v) => v.topic === diyTopic).map((v) => v.title)).toContain(cards[2]!.querySelector('.dc-vc-t')!.textContent)
  })
  it('thumbs are still pictures with no referrer, sized and lazy', () => {
    const { container } = render(<Overview now={now} />)
    const imgs = Array.from(container.querySelectorAll('[data-testid="dc-watch"] .dc-still img'))
    expect(imgs).toHaveLength(4)
    imgs.forEach((img) => {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/mqdefault\.jpg$/)
      expect(img.getAttribute('alt')).toBe(''); expect(img.getAttribute('loading')).toBe('lazy')
      expect(img.getAttribute('width')).toBe('320'); expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    })
  })
  it('tapping a video stores it for Watch; a new-tab click does not', () => {
    render(<Overview now={now} />)
    const a = screen.getByTestId('dc-hero').querySelector('a')!
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey']) { fireEvent.click(a, { [k]: true }); expect(sessionStorage.getItem('dc.watch')).toBeNull() }
    const src = a.querySelector('img')!.getAttribute('src')!
    fireEvent.click(a)
    expect(src).toContain(sessionStorage.getItem('dc.watch')!)
    const last = screen.getByTestId('dc-videos').querySelectorAll('a.dc-vrow')[2]!
    fireEvent.click(last)
    expect(last.querySelector('img')!.getAttribute('src')).toContain(sessionStorage.getItem('dc.watch')!)
  })
})

describe('Learn', () => {
  const cards = () => Array.from(screen.getByTestId('dc-learn').querySelectorAll('a.dc-lc')).map((c) => [c.querySelector('.dc-lc-t')!.textContent, c.getAttribute('href'), c.getAttribute('data-tint')])
  it('four main tinted cards onto existing Learn topics, All topics link', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-learn')
    expect(within(sec).getByRole('link', { name: 'All topics' }).getAttribute('href')).toBe('#discover/learn')
    expect(cards()).toEqual([
      ['Health topics', '#discover/learn/library', 'purple'], ['Be prepared', '#discover/learn/prepping', 'teal'],
      ['Recipes', '#discover/learn/recipes', 'amber'], ['Home repairs', '#discover/learn/repairs', 'green']
    ])
    expect(screen.getByTestId('dc-learn-recipes').textContent).toContain(RECIPES.length + ' low-salt recipes')
  })
  it('Medicines takes the fourth place when the flag is on', async () => {
    await db.kv.put({ key: 'learn.medcards', value: true })
    render(<Overview now={now} />)
    await waitFor(() => expect(cards()[3]).toEqual(['Medicines', '#discover/learn/meds', 'green']))
    expect(cards()).toHaveLength(4)
  })
})

describe('Listen', () => {
  it('one large guided video from the Calm list: a play button with the video named, big title, See all', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-listen')
    expect(within(sec).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('#discover/listen')
    const g = CALM_VIDEOS[0]!
    expect(within(sec).getByRole('button', { name: new RegExp('^Play ' + g.title) })).toBeTruthy()
    expect(screen.getByTestId('dc-guided').querySelector('.dc-guided-t')!.textContent).toBe(g.title)
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
