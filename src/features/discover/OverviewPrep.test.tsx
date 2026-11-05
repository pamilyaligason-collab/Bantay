import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('./news/Screen', async (orig) => ({ ...(await orig<typeof import('./news/Screen')>()), useNewsZone: () => null, loadFeed: vi.fn().mockResolvedValue({ items: [], savedAt: null, offline: false }) }))
beforeEach(async () => { location.hash = '#discover'; sessionStorage.clear(); await db.kv.clear() })
afterEach(() => { cleanup(); vi.doUnmock('./learn/ready'); vi.resetModules() })

const now = new Date(2026, 9, 28, 10, 20)

describe('Be prepared row (S21, D-124)', () => {
  it('shows up to three checked prepping videos, a See all link to the topic, and nothing but prepping', async () => {
    const { default: Overview } = await import('./Overview')
    const { READY_VIDEOS, READY_TOPICS } = await import('./learn/ready')
    render(<Overview now={now} />)
    const sec = within(screen.getByTestId('dc-prep-row'))
    expect(sec.getByRole('heading', { level: 2 }).textContent).toBe('Be prepared')
    expect(sec.getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('#discover/learn/prepping')
    const cards = screen.getByTestId('dc-prep-row').querySelectorAll('.dc-vc')
    expect(cards.length).toBe(3)
    const topic = READY_TOPICS.find((t) => t.id === 'prepping')!.video
    const titles = READY_VIDEOS.filter((v) => v.topic === topic).map((v) => v.title)
    cards.forEach((c) => expect(titles).toContain(c.querySelector('.dc-vc-t')!.textContent))
  })

  it('no checked prepping video: the section does not render, the rest of the page does', async () => {
    vi.resetModules()
    vi.doMock('./learn/ready', async (orig) => {
      const o = await orig<typeof import('./learn/ready')>()
      return { ...o, READY_VIDEOS: [] }
    })
    const { default: Overview } = await import('./Overview')
    render(<Overview now={now} />)
    expect(screen.queryByTestId('dc-prep-row')).toBeNull()
    expect(screen.getByTestId('dc-learn')).toBeTruthy()
    expect(screen.getByTestId('dc-ready')).toBeTruthy() // the Ready at home card stays
  })
})

describe('Be prepared row logic (S21, D-124)', () => {
  // Hand-written ids. The mocked "video of the day" shows P1 as the hero and P2 as a card; X is a prepping entry that cannot play.
  const v = (id: string, placeholder = false) => ({ id, placeholder, title: `Video ${id}`, topic: 'Prepping', source: 'Invented', minutes: null })
  const P1 = v('aaaaaaaaaa1'), P2 = v('aaaaaaaaaa2'), P3 = v('aaaaaaaaaa3'), P4 = v('aaaaaaaaaa4'), X = v('aaaaaaaaaaX', true)

  async function open() {
    vi.resetModules()
    vi.doMock('./learn/ready', async (orig) => {
      const o = await orig<typeof import('./learn/ready')>()
      const ready = [P1, X, P2, P3, P4]
      return { ...o, READY_TOPICS: [{ id: 'prepping', video: 'Prepping', title: 'Be prepared', sub: 'x', icon: 'file' }], READY_VIDEOS: ready, DISCOVER_VIDEOS: ready }
    })
    vi.doMock('./today/featured', () => ({ featured: () => ({ hero: P1, more: [P2] }) }))
    const { default: Overview } = await import('./Overview')
    render(<Overview now={now} />)
    return screen.getByTestId('dc-prep-row')
  }
  afterEach(() => vi.doUnmock('./today/featured'))

  it('puts the videos not shown above first, leaves the unplayable one out, and fills with a shown one', async () => {
    const sec = await open()
    expect(Array.from(sec.querySelectorAll('.dc-vc-t')).map((n) => n.textContent)).toEqual(['Video aaaaaaaaaa3', 'Video aaaaaaaaaa4', 'Video aaaaaaaaaa1'])
  })

  it('a card opens that video in Watch', async () => {
    const sec = await open()
    const card = sec.querySelectorAll<HTMLAnchorElement>('a.dc-prep')[1]! // Video 4
    expect(card.getAttribute('href')).toBe('#discover/watch')
    fireEvent.click(card)
    expect(sessionStorage.getItem('dc.watch')).toBe('aaaaaaaaaa4')
  })
})
