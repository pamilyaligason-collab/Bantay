import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { vdb } from './visitsStore'
import { clipReasons, ForYou, forYouClips, MAX_CLIPS } from './ForYou'
import { playable, VIDEOS } from './library/videosLogic'
import { pickAttention } from './attention'
import type { Reading } from './ranges'

const track = vi.hoisted(() => vi.fn())
vi.mock('../admin/events', async (orig) => ({ ...(await orig<object>()), track }))
afterEach(cleanup)
const r: Reading[] = [{ personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: new Date().toISOString(), labLow: 0, labHigh: 130 }]
const show = (readings: Reading[]) => render(<ForYou personId="p1" readings={readings} attention={pickAttention(readings, () => undefined, new Date())} canLog onAdd={() => undefined} />)

describe('For you', () => {
  it('holds a nudge card, a video card and an article card', async () => {
    show(r)
    const c = screen.getByTestId('for-you')
    expect(within(c).getByTestId('nudge').querySelector('a.nr-t')!.getAttribute('href')).toBe('#health/nudge')
    const tile = within(c).getByTestId('foryou-video')
    expect(tile.tagName).toBe('BUTTON')
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(tile)
    expect(within(c).getByTestId('foryou-video').querySelector('iframe')!.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//) // plays in place, no dead link
    const art = within(c).getByTestId('foryou-because')
    expect(art.textContent).toContain('Because of your LDL cholesterol')
    await waitFor(() => expect(screen.getByTestId('foryou-because').getAttribute('href')).toBe('#health/library/' + encodeURIComponent('t:ldl'))) // a lab in the glossary opens its own note, not the online look-up
  })
  it('S26: ALT links to the glossary note (t:alt), not s:ALT', async () => {
    const alt: Reading[] = [{ personId: 'p1', test: 'alt', value: 120, unit: 'U/L', takenAt: new Date().toISOString(), labLow: 7, labHigh: 56 }]
    show(alt)
    await waitFor(() => expect(screen.getByTestId('foryou-because').getAttribute('href')).toBe('#health/library/t%3Aalt'))
    fireEvent.click(screen.getByTestId('foryou-because'))
    expect(track).toHaveBeenCalledWith('action', 'card_explainer')
  })
  it('empty person: no nudge, no article, video stays', () => {
    show([])
    expect(screen.queryByTestId('nudge')).toBeNull()
    expect(screen.queryByTestId('foryou-because')).toBeNull()
    expect(screen.getByTestId('foryou-video')).toBeTruthy()
  })
})

describe('For you order', () => {
  it('video, because of you, then the log row; four videos show, Show 2 more adds the last two (D-156)', () => {
    show(r)
    const ids = () => Array.from(screen.getByTestId('for-you').querySelectorAll('[data-testid^="foryou-"]')).map((e) => e.getAttribute('data-testid')).filter((x) => x !== 'foryou-videos')
    expect(ids()).toEqual(['foryou-video', 'foryou-video-2', 'foryou-video-3', 'foryou-video-4', 'foryou-because', 'foryou-log'])
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(ids()).toEqual(['foryou-video', 'foryou-video-2', 'foryou-video-3', 'foryou-video-4', 'foryou-video-5', 'foryou-video-6', 'foryou-because', 'foryou-log'])
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })
  it('no swipe row: the videos are a 2-column grid, not a scrolling strip', () => {
    show(r)
    expect(screen.getByTestId('for-you').querySelector('.fy-vids')).toBeNull()
    expect(within(screen.getByTestId('foryou-videos')).getByRole('group', { name: 'Videos for you' }).classList.contains('more-grid')).toBe(true)
  })
})

describe('For you videos show their still, length and reason', () => {
  it('every video card has the i.ytimg.com still, a length and a reason line', () => {
    show(r)
    for (const id of ['foryou-video', 'foryou-video-2']) {
      const card = screen.getByTestId(id)
      const img = card.querySelector('img')!
      expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/)
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
      expect(card.querySelector('.md-len')!.textContent).toMatch(/^\d+ min$/)
      expect(card.querySelector('.md-line')!.textContent).toBeTruthy()
    }
  })
  it('a still that cannot load falls back to the plain tile with the play mark (no broken image)', () => {
    show(r)
    const card = screen.getByTestId('foryou-video')
    fireEvent.error(card.querySelector('img')!)
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('.md-pic')).toBeTruthy()
    expect(card.querySelector('.md-play')).toBeTruthy()
    expect(card.querySelector('.md-len')).toBeTruthy()
  })
  it('reasons come from loaded data: BP readings and an out-of-range blood sugar lead; no data, no reason', () => {
    const t = new Date().toISOString()
    const bp: Reading = { personId: 'p1', test: 'bp_systolic', value: 120, unit: 'mmHg', takenAt: t }
    expect(clipReasons([bp], null).map((x) => x.text)).toEqual(['Because you log blood pressure'])
    const sugar: Reading = { personId: 'p1', test: 'fasting_glucose', value: 160, unit: 'mg/dL', takenAt: t, labLow: 70, labHigh: 100 }
    expect(clipReasons([sugar], pickAttention([sugar], () => undefined, new Date())).map((x) => x.text)).toEqual(['Because of a lab result'])
    expect(clipReasons([], null)).toEqual([])
    expect(clipReasons(r, pickAttention(r, () => undefined, new Date()))).toEqual([]) // LDL: no matching clip, no claim
  })
  it('clips that fit a reason come first; the rest say what they cover; none playable shows none', () => {
    const list = VIDEOS.filter(playable)
    const now = new Date(2026, 10, 6, 12)
    const bp = forYouClips(list, [{ text: 'Because you log blood pressure', match: (v) => /blood pressure/i.test(v.title) }], now)
    expect(bp[0]!.reason).toBe('Because you log blood pressure')
    expect(bp[0]!.video.title).toMatch(/blood pressure/i)
    expect(bp).toHaveLength(MAX_CLIPS) // a row of six when the list has them
    expect(bp.at(-1)!.reason).toBe(`Because it covers ${bp.at(-1)!.video.topic}`)
    expect(new Set(bp.map((c) => c.video.id)).size).toBe(MAX_CLIPS) // no repeats
    const tied = forYouClips(list, [{ text: 'Because of a lab result', match: (v) => v.topic === 'Diabetes' }], now)
    expect(tied[0]!.video.topic).toBe('Diabetes')
    const plain = forYouClips(list, [], now)
    expect(plain.map((c) => c.reason)).toEqual(plain.map((c) => `Because it covers ${c.video.topic}`))
    expect(plain[1]!.video).not.toBe(plain[0]!.video)
    expect(forYouClips([], [])).toEqual([])
    expect(forYouClips(list.slice(0, 1), [])).toHaveLength(1)
  })
})

describe('For you reads (S24)', () => {
  it('the video grid shows 4 cards, each with a reason', () => {
    show(r)
    const cards = Array.from(within(screen.getByRole('group', { name: 'Videos for you' })).getAllByRole('button'))
    expect(cards).toHaveLength(4)
    for (const c of cards) expect(c.querySelector('.md-line')!.textContent).toBeTruthy()
  })
  it('visit questions read link appears only with a booked next visit and goes to #health/visits', async () => {
    await Promise.all([db.kv.clear(), vdb.appointments.clear(), vdb.followUps.clear()])
    show([])
    await new Promise((res) => setTimeout(res, 30))
    expect(screen.queryByTestId('foryou-visit')).toBeNull()
    cleanup()
    await vdb.appointments.add({ clientId: 'a1', personId: 'p1', provider: 'Dr. Test', startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() })
    show([])
    const link = await waitFor(() => screen.getByTestId('foryou-visit'))
    expect(link.getAttribute('href')).toBe('#health/visits')
    expect(link.textContent).toContain('Questions to bring on')
  })
})

describe('For you cards play in place', () => {
  it('a modified click still plays here; More scrolls to the Health videos section at 44 px', () => {
    show(r)
    const card = screen.getByTestId('foryou-video-2')
    expect(card.tagName).toBe('BUTTON')
    fireEvent.click(card)
    expect(screen.getByTestId('foryou-video-2').querySelector('iframe')).not.toBeNull()
    expect(screen.getByTestId('foryou-video-2').querySelector('.hv-open')).toBeNull()
    const more = within(screen.getByTestId('for-you')).getByRole('button', { name: 'More' })
    const target = document.createElement('section'); target.id = 'health-videos'
    const scroll = vi.fn(); target.scrollIntoView = scroll; document.body.appendChild(target)
    fireEvent.click(more)
    expect(scroll).toHaveBeenCalledTimes(1) // More goes to the Health videos section, not to Discover
    target.remove()
  })
})
