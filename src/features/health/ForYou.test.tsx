import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clipReasons, ForYou, forYouClips } from './ForYou'
import { playable, VIDEOS } from './library/videosLogic'
import { pickAttention } from './attention'
import type { Reading } from './ranges'

afterEach(cleanup)
const r: Reading[] = [{ personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: new Date().toISOString(), labLow: 0, labHigh: 130 }]
const show = (readings: Reading[]) => render(<ForYou personId="p1" readings={readings} attention={pickAttention(readings, () => undefined, new Date())} canLog onAdd={() => undefined} />)

describe('For you', () => {
  it('holds a nudge card, a video card and an article card', () => {
    show(r)
    const c = screen.getByTestId('for-you')
    expect(within(c).getByTestId('nudge').querySelector('a.nr-t')!.getAttribute('href')).toBe('#health/nudge')
    expect(within(c).getByTestId('foryou-video').getAttribute('href')).toBe('#discover/watch')
    const art = within(c).getByTestId('foryou-because')
    expect(art.textContent).toContain('Because of your LDL cholesterol')
    expect(art.getAttribute('href')).toBe('#discover/learn/library/' + encodeURIComponent('s:LDL cholesterol'))
  })
  it('empty person: no nudge, no article, video stays', () => {
    show([])
    expect(screen.queryByTestId('nudge')).toBeNull()
    expect(screen.queryByTestId('foryou-because')).toBeNull()
    expect(screen.getByTestId('foryou-video')).toBeTruthy()
  })
})

describe('For you order', () => {
  it('video, because of you, then the log row', () => {
    show(r)
    const ids = Array.from(screen.getByTestId('for-you').querySelectorAll('[data-testid^="foryou-"]')).map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['foryou-video', 'foryou-video-2', 'foryou-because', 'foryou-log'])
  })
})

describe('For you videos show their still, length and reason', () => {
  it('every video card has the i.ytimg.com still, a length and a reason line', () => {
    show(r)
    for (const id of ['foryou-video', 'foryou-video-2']) {
      const card = screen.getByTestId(id)
      const img = card.querySelector('img.fy-img')!
      expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/)
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
      expect(card.querySelector('.fy-len')!.textContent).toMatch(/^\d+ min$/)
      expect(card.querySelector('.pt-k')!.textContent).toBeTruthy()
    }
  })
  it('a still that cannot load falls back to the plain tile with the play mark (no broken image)', () => {
    show(r)
    const card = screen.getByTestId('foryou-video')
    fireEvent.error(card.querySelector('img.fy-img')!)
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('.fy-poster')!.getAttribute('data-still')).toBe('off')
    expect(card.querySelector('.fy-play')).toBeTruthy()
    expect(card.querySelector('.fy-len')).toBeTruthy()
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
  it('clips that fit a reason come first; the rest carry their topic; none playable shows none', () => {
    const list = VIDEOS.filter(playable)
    const now = new Date(2026, 10, 6, 12)
    const bp = forYouClips(list, [{ text: 'Because you log blood pressure', match: (v) => /blood pressure/i.test(v.title) }], now)
    expect(bp[0]!.reason).toBe('Because you log blood pressure')
    expect(bp[0]!.video.title).toMatch(/blood pressure/i)
    expect(bp).toHaveLength(2)
    expect(bp[1]!.reason).toBe(bp[1]!.video.topic)
    const tied = forYouClips(list, [{ text: 'Because of a lab result', match: (v) => v.topic === 'Diabetes' }], now)
    expect(tied[0]!.video.topic).toBe('Diabetes')
    const plain = forYouClips(list, [], now)
    expect(plain.map((c) => c.reason)).toEqual(plain.map((c) => c.video.topic))
    expect(plain[1]!.video).not.toBe(plain[0]!.video)
    expect(forYouClips([], [])).toEqual([])
    expect(forYouClips(list.slice(0, 1), [])).toHaveLength(1)
  })
})

describe('For you hands the video to Watch', () => {
  it('tapping a card stores its id under dc.watch; a modified click does not; More links to Watch at 44 px', () => {
    sessionStorage.clear()
    show(r)
    const card = screen.getByTestId('foryou-video-2')
    const id = /\/vi\/([^/]+)\//.exec(card.querySelector('img.fy-img')!.getAttribute('src')!)![1]
    fireEvent.click(card, { ctrlKey: true })
    expect(sessionStorage.getItem('dc.watch')).toBeNull()
    fireEvent.click(card)
    expect(sessionStorage.getItem('dc.watch')).toBe(id)
    const more = within(screen.getByTestId('for-you')).getByRole('link', { name: 'More' })
    expect(more.getAttribute('href')).toBe('#discover/watch')
  })
})
