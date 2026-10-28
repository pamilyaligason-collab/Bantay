import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import fil from '../../../data/play/words-fil.json'
import trivia from '../../../data/play/trivia.json'
import Facts from './Facts'
import Memory from './Memory'
import PlayScreen from './Screen'
import Trivia from './Trivia'
import WordSearch from './WordSearch'
import { makePuzzle, newMemory, pickWords, playedToday, triviaIndex, type Trivia as Q } from './score'

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Play hub', () => {
  it('shows the games, the legal line, and no memory or dementia claim; a game opens and Back returns', async () => {
    render(<PlayScreen />)
    expect(screen.getByText('Nothing played yet today')).toBeTruthy()
    expect(screen.getByText(/No claim about memory or dementia/)).toBeTruthy()
    for (const n of ['Memory match', 'Word search', 'Alam mo ba?', 'Fun facts today']) expect(screen.getByText(n)).toBeTruthy()
    fireEvent.click(screen.getByText('Memory match'))
    expect(screen.getByTestId('memory')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Play' }))
    expect(screen.getByTestId('play-hub')).toBeTruthy()
  })
  it('the "Played today" line comes from the local count', async () => {
    await db.kv.put({ key: 'play.day', value: { day: new Date().toLocaleDateString('sv-SE'), n: 2, games: ['Memory match', 'Alam mo ba?'], days: {} } })
    render(<PlayScreen />)
    expect(await screen.findByText('Played today: 2 games')).toBeTruthy()
    expect(screen.getByText('Memory match, Alam mo ba?. Nice work.')).toBeTruthy()
  })
})

describe('Play hub Jack (D-91)', () => {
  // Only Date is faked (a local clock, ML-38) so IndexedDB and findBy keep real timers; the seed day is the hand-written local day.
  afterEach(() => { vi.useRealTimers() })
  const put = (day: string, n: number) => db.kv.put({ key: 'play.day', value: { day, n, games: ['Memory match'], days: {} } })
  it.each([[new Date(2026, 9, 28, 12, 0), '12:00'], [new Date(2026, 9, 28, 23, 30), '23:30']])('plays with a ball for 0 to 2 games today (%s %s)', async (now) => {
    vi.useFakeTimers({ toFake: ['Date'], now })
    await put('2026-10-28', 2)
    render(<PlayScreen />)
    await screen.findByText('Played today: 2 games')
    expect(screen.getByAltText('Jack Jack playing with a ball')).toBeTruthy()
    expect(document.querySelectorAll('img.jack')).toHaveLength(1)
  })
  it.each([[new Date(2026, 9, 28, 12, 0), '12:00'], [new Date(2026, 9, 28, 23, 30), '23:30']])('jumps for joy from the third game today (%s %s)', async (now) => {
    vi.useFakeTimers({ toFake: ['Date'], now })
    await put('2026-10-28', 3)
    render(<PlayScreen />)
    expect(await screen.findByAltText('Jack Jack jumping for joy')).toBeTruthy()
    expect(screen.queryByAltText('Jack Jack playing with a ball')).toBeNull()
    expect(document.querySelectorAll('img.jack')).toHaveLength(1)
  })
  it('at 23:30 a count saved on the previous local day does not celebrate', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 28, 23, 30) })
    await put('2026-10-27', 5)
    render(<PlayScreen />)
    await screen.findByText('Nothing played yet today')
    expect(screen.getByAltText('Jack Jack playing with a ball')).toBeTruthy()
  })
})

describe('Memory match screen', () => {
  it('solving all 6 pairs says kind words with no number, and counts one game played today', async () => {
    const seed = 11
    const labels = newMemory(seed).cards.map((c) => c.label)
    render(<Memory onBack={() => undefined} seed={seed} />)
    expect(screen.getByText('Pairs found: 0 of 6')).toBeTruthy()
    const cards = screen.getAllByRole('button', { name: /Card \d+, face down/ })
    expect(cards).toHaveLength(12)
    for (const name of new Set(labels)) {
      const [a, b] = labels.flatMap((l, i) => (l === name ? [i] : []))
      fireEvent.click(screen.getByRole('button', { name: `Card ${a! + 1}, face down` }))
      fireEvent.click(screen.getByRole('button', { name: `Card ${b! + 1}, face down` }))
    }
    expect(screen.getByText('Pairs found: 6 of 6')).toBeTruthy()
    const msg = screen.getByText(/found them all|sharp eye|Every pair is found/)
    expect(msg.textContent).not.toMatch(/\d|wrong|score/i)
    await waitFor(async () => expect(await playedToday()).toBe(1))
  })
})

describe('Word search screen', () => {
  it('tapping the first and last letter of a word crosses it off the list', async () => {
    const seed = 3
    const p = makePuzzle(pickWords(fil.words, seed), seed)
    const w = p.placed[0]!
    render(<WordSearch onBack={() => undefined} seed={seed} />)
    const cell = (y: number, x: number) => screen.getByRole('button', { name: `${p.grid[y]![x]}, row ${y + 1}, column ${x + 1}` })
    fireEvent.click(cell(w.r, w.c))
    fireEvent.click(cell(w.r + w.dr * (w.word.length - 1), w.c + w.dc * (w.word.length - 1)))
    expect(screen.getByText(`Found ${w.word}.`)).toBeTruthy()
    expect(screen.getByText(w.word, { selector: '.fp-chip' }).className).toContain('is-done')
    // a miss is gentle
    fireEvent.click(cell(7, 7)); fireEvent.click(cell(7, 6))
    expect(screen.getByRole('status').textContent).not.toMatch(/wrong/i)
  })
  it('switching to English gives an English list; New puzzle changes the grid', () => {
    render(<WordSearch onBack={() => undefined} seed={5} />)
    const grid = () => screen.getAllByRole('button', { name: /row \d+, column \d+/ }).map((b) => b.textContent).join('')
    const before = grid()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(screen.getAllByLabelText('Words to find')[0]!.textContent).toMatch(/[A-Z]/)
    fireEvent.click(screen.getByRole('button', { name: 'New puzzle' }))
    expect(grid()).not.toBe(before)
  })
})

describe('Alam mo ba? screen', () => {
  const qs = trivia.questions as Q[]
  it('a different pick says Close, never wrong, marks the right answer and counts a game', async () => {
    const day = '2026-10-28'
    const q = qs[triviaIndex(day, qs.length)]!
    render(<Trivia onBack={() => undefined} day={day} />)
    expect(screen.getByText(q.q)).toBeTruthy()
    const other = q.a.findIndex((_a, i) => i !== q.right)
    fireEvent.click(screen.getByRole('group', { name: 'Answers' }).querySelectorAll('button')[other]!)
    expect(screen.getByRole('status').textContent).toContain(`Close! It is ${q.a[q.right]}.`)
    expect(document.body.textContent).not.toMatch(/wrong/i)
    expect(document.querySelectorAll('.fp-ans.is-right')).toHaveLength(1)
    expect(document.querySelector('.fp-ans.is-right')!.textContent).toContain(q.a[q.right]!)
    expect(screen.getByText('Your answer')).toBeTruthy()
    await waitFor(async () => expect(await playedToday()).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Another question' }))
    expect(screen.getByText('Another question', { selector: '.sh-sub' })).toBeTruthy()
  })
})

describe('Fun facts screen', () => {
  it('shows an On this day card with the Wikipedia credit and link, and a Philippine fact', async () => {
    const events = [{ year: 1881, text: 'The Gunfight at the O.K. Corral takes place.', pages: [{ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Gunfight' } } }] }]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ events }), { status: 200 })))
    render(<Facts onBack={() => undefined} now={new Date(2026, 9, 28, 10, 20)} />)
    expect(await screen.findByText(/1881: The Gunfight/)).toBeTruthy()
    expect(screen.getAllByText(/CC BY-SA 4\.0/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open on Wikipedia' }).getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Gunfight')
    expect(screen.getByRole('region', { name: 'Did you know? Philippines' }).textContent!.length).toBeGreaterThan(30)
  })
  it('offline with nothing saved still shows the Philippine fact and a plain message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<Facts onBack={() => undefined} now={new Date(2026, 9, 28)} />)
    expect(await screen.findByText(/No signal yet/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Did you know? Philippines' })).toBeTruthy()
  })
})
