import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsItem } from '../safety/news'
import { loadFeed } from './news/Screen'
import { db } from '../../db'
import { RECIPES } from './learn/data'
import { phFactOf } from './facts/onThisDay'
import { dayKey } from './play/score'
import { playable } from '../health/library/videosLogic'
import { DISCOVER_VIDEOS } from './learn/ready'
import { featured } from './today/featured'
import Overview from './Overview'

vi.mock('./news/Screen', async (orig) => ({ ...(await orig<typeof import('./news/Screen')>()), useNewsZone: () => null, loadFeed: vi.fn() }))
const feed = (items: NewsItem[] | null) => vi.mocked(loadFeed).mockResolvedValue({ items, savedAt: null, offline: false })

beforeEach(async () => { feed([]); location.hash = '#discover'; sessionStorage.clear(); await db.kv.clear() })
afterEach(cleanup)

const now = new Date(2026, 9, 28, 10, 20)
const vids = DISCOVER_VIDEOS.filter(playable)
const { hero, more } = featured(now, vids)

describe('Overview head, hero, video cards, season', () => {
  it('draws the large title with the kicker', () => {
    render(<Overview now={now} />)
    const head = screen.getByTestId('dc-head')
    expect(within(head).getByRole('heading', { level: 1 }).textContent).toBe('Discover')
    expect(head.querySelector('.lt-kicker')!.textContent).toBe('Learn, watch, play')
  })
  it('one hero holding the video of the day', () => {
    const { container } = render(<Overview now={now} />)
    expect(container.querySelectorAll('[data-hero]').length).toBe(1)
    const h = within(screen.getByTestId('dc-hero'))
    expect(screen.getByTestId('dc-hero').hasAttribute('data-hero')).toBe(true)
    expect(h.getByText(`Watch · ${vids.length} checked videos`)).toBeTruthy()
    expect(h.getByText('Watch · 26 checked videos')).toBeTruthy()
    expect(h.getByText(hero!.title)).toBeTruthy()
    expect(h.getByText('Plays in privacy mode after you tap')).toBeTruthy()
    const a = screen.getByTestId('dc-hero').querySelector('a')!
    expect(a.getAttribute('href')).toBe('#discover/watch')
    expect(a.querySelector('.dc-hero-play')).toBeTruthy()
    expect(a.querySelector('.dc-poster-box')).toBeTruthy()
  })
  it('two more video cards, thumbs are still pictures with no referrer', () => {
    const { container } = render(<Overview now={now} />)
    const cards = screen.getByTestId('dc-videos').querySelectorAll('a.dc-vc')
    expect(Array.from(cards).map((c) => c.querySelector('.dc-vc-t')!.textContent)).toEqual(more.map((m) => m.title))
    expect(Array.from(cards).map((c) => c.getAttribute('href'))).toEqual(['#discover/watch', '#discover/watch'])
    const imgs = Array.from(container.querySelectorAll('.dc-thumb img'))
    expect(imgs.length).toBe(3)
    const ids = [hero!, ...more].map((v) => v.id)
    imgs.forEach((img, i) => {
      expect(img.getAttribute('src')).toBe(`https://i.ytimg.com/vi/${ids[i]}/mqdefault.jpg`)
      expect(img.getAttribute('alt')).toBe('')
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
      expect(img.getAttribute('loading')).toBe('lazy')
    })
  })
  it('the season row follows the video cards; no tiles, no pick', () => {
    render(<Overview now={now} />)
    const v = screen.getByTestId('dc-videos'), s = screen.getByTestId('season-row')
    expect(v.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId('discover-tiles')).toBeNull()
    expect(screen.queryByTestId('pick')).toBeNull()
  })
  it('tapping the hero or a small card stores that video for Watch', () => {
    const { container } = render(<Overview now={now} />)
    fireEvent.click(screen.getByTestId('dc-hero').querySelector('a')!)
    expect(sessionStorage.getItem('dc.watch')).toBe(hero!.id)
    fireEvent.click(screen.getByTestId('dc-videos').querySelectorAll('a.dc-vc')[1]!)
    expect(sessionStorage.getItem('dc.watch')).toBe(more[1]!.id)
    expect(container.querySelectorAll('a[href="#discover/watch"]').length).toBe(3)
  })
  it('a new-tab click (ctrl, meta or shift) does not hand the video over', () => {
    render(<Overview now={now} />)
    const a = screen.getByTestId('dc-hero').querySelector('a')!
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey']) { fireEvent.click(a, { [k]: true }); expect(sessionStorage.getItem('dc.watch')).toBeNull() }
  })
})

const tiles = (id: string) => Array.from(screen.getByTestId(id).querySelectorAll('.dc-lcard')).map((t) => ({ t: t.querySelector('.rw-title')!.textContent, s: t.querySelector('.rw-sub')?.textContent, h: t.querySelector('a')!.getAttribute('href'), tint: t.getAttribute('data-tint') }))
const listenRows = () => Array.from(screen.getByTestId('dc-listen').querySelectorAll('.rw'))
const speakOk = () => { vi.stubGlobal('SpeechSynthesisUtterance', class { onend: (() => void) | null = null }); Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: vi.fn(), cancel: vi.fn() } }) }
afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(window, 'speechSynthesis') })

describe('Discover search', () => {
  it('the header has a search button that opens the library search', () => {
    render(<Overview now={now} />)
    expect(screen.getByTestId('dc-search').getAttribute('href')).toBe('#discover/learn/library')
    expect(screen.getByRole('link', { name: 'Search health topics' })).toBeTruthy()
  })
})

describe('Learn and Listen', () => {
  it('Learn: Recipes and Topics cards by default, link to All topics', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-learn')
    expect(within(sec).getByRole('heading', { level: 2 }).textContent).toBe('Learn')
    expect(within(sec).getByRole('link', { name: 'All topics' }).getAttribute('href')).toBe('#discover/learn')
    expect(tiles('dc-learn')).toEqual([
      { t: 'Recipes', s: RECIPES.length + ' low-salt recipes', h: '#discover/learn/recipes', tint: 'amber' },
      { t: 'Topics', s: 'Plain reads on health topics', h: '#discover/learn/library', tint: 'purple' }
    ])
  })
  it('Medicines is the first Learn card, only with the flag on', async () => {
    await db.kv.put({ key: 'learn.medcards', value: true })
    render(<Overview now={now} />)
    await waitFor(() => expect(tiles('dc-learn').length).toBe(3))
    expect(tiles('dc-learn')[0]).toEqual({ t: 'Medicines', s: 'What each medicine is for', h: '#discover/learn/meds', tint: 'green' })
  })
  it('Listen: lead line, See all, three rows each with a Play button named for its recipe', () => {
    speakOk()
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-listen')
    expect(within(sec).getByRole('heading', { level: 2 }).textContent).toBe('Listen')
    expect(within(sec).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('#discover/listen')
    expect(within(sec).getByText('Read aloud by your phone')).toBeTruthy()
    expect(listenRows().length).toBe(3)
    RECIPES.slice(0, 3).forEach((r) => expect(within(sec).getByRole('button', { name: `Play ${r.name}` })).toBeTruthy())
  })
  it('Listen: a phone with no voice shows a line, not dead buttons', () => {
    render(<Overview now={now} />)
    expect(listenRows().length).toBe(0)
    expect(within(screen.getByTestId('dc-listen')).getByText('Reading aloud is not on this phone yet.')).toBeTruthy()
  })
  it('sections come in order: videos, season, learn, listen, ready at home, play', () => {
    render(<Overview now={now} />)
    const ids = ['dc-hero', 'dc-videos', 'season-row', 'dc-learn', 'dc-listen', 'dc-ready', 'dc-play']
    const els = ids.map((i) => screen.getByTestId(i))
    els.slice(1).forEach((e, i) => expect(els[i]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
  })
})

describe('Ready at home (D-117)', () => {
  it('two topic rows with their counts, linking to Learn', () => {
    render(<Overview now={now} />)
    const sec = within(screen.getByTestId('dc-ready'))
    expect(sec.getByRole('heading', { level: 2 }).textContent).toBe('Ready at home')
    expect(screen.getByTestId('dc-ready-prepping').querySelector('a')!.getAttribute('href')).toBe('#discover/learn/prepping')
    expect(screen.getByTestId('dc-ready-prepping').textContent).toContain('8 videos · 6 reads') // counted by hand in src/data/discover/ready.json
    expect(screen.getByTestId('dc-ready-repairs').querySelector('a')!.getAttribute('href')).toBe('#discover/learn/repairs')
    expect(screen.getByTestId('dc-ready-repairs').textContent).toContain('6 videos · 5 reads')
  })
})

describe('Play and Did you know', () => {
  it('two game cards with deep links, All games link', () => {
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-play')
    expect(within(sec).getByRole('heading', { level: 2 }).textContent).toBe('Play')
    expect(within(sec).getByRole('link', { name: 'All games' }).getAttribute('href')).toBe('#discover/play')
    const cards = Array.from(sec.querySelectorAll('a.pt'))
    expect(cards.map((c) => [c.querySelector('.pt-v')!.textContent, c.querySelector('.pt-s')!.textContent, c.getAttribute('href'), c.getAttribute('data-tint')])).toEqual([
      ['Memory', 'Match the pairs', '#discover/play/memory', 'blue'],
      ['Word search', 'Find the hidden words', '#discover/play/wordsearch', 'red']
    ])
  })
  it('the fact of the day opens the fun facts', () => {
    render(<Overview now={now} />)
    const f = screen.getByTestId('dc-fact')
    expect(f.tagName).toBe('A')
    expect(f.querySelector('.dc-fact-k')!.textContent).toBe('Did you know?')
    expect(f.querySelector('.dc-fact-t')!.textContent).toBe(phFactOf(dayKey(now)))
    expect(f.querySelector('img.jack')).toBeTruthy()
    expect(f.getAttribute('href')).toBe('#discover/play/facts')
    expect(f.getAttribute('data-tint')).toBe('green')
  })
})

const hl = (id: string, source: string): NewsItem => ({ id, title: 'Headline ' + id, url: 'https://news.test/' + id, source, kind: 'article', published_at: '2026-10-28T09:20:00Z', zone: null })

describe('News', () => {
  it('first two non-official headlines as external links, See all to the News tab', async () => {
    feed([hl('o', 'PAGASA'), hl('a', 'PNA'), hl('b', 'Rappler'), hl('c', 'GMA')])
    render(<Overview now={now} />)
    const sec = screen.getByTestId('dc-news')
    expect(within(sec).getByRole('heading', { level: 2 }).textContent).toBe('News')
    expect(within(sec).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('#discover/news')
    await waitFor(() => expect(sec.querySelectorAll('a.fp-hl').length).toBe(2))
    const links = Array.from(sec.querySelectorAll('a.fp-hl'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://news.test/a', 'https://news.test/b'])
    links.forEach((a) => { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('rel')).toBe('noopener noreferrer') })
    expect(links[0]!.textContent).toContain('Headline a')
    expect(links[0]!.textContent).toContain('PNA')
    expect(links[0]!.textContent).toContain('(opens the news site)')
    expect(links[0]!.querySelector('.dc-sr')).toBeTruthy()
  })
  it('reloads the headlines on bantay:refresh', async () => {
    feed([hl('a', 'PNA')])
    render(<Overview now={now} />)
    await screen.findByText('Headline a')
    feed([hl('z', 'GMA')])
    let done: Promise<unknown> = Promise.resolve()
    window.dispatchEvent(new CustomEvent('bantay:refresh', { detail: { waitUntil: (p: Promise<unknown>) => { done = p } } }))
    await done
    expect(await screen.findByText('Headline z')).toBeTruthy()
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
  it('comes after the fact card', () => {
    render(<Overview now={now} />)
    expect(screen.getByTestId('dc-fact').compareDocumentPosition(screen.getByTestId('dc-news')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
