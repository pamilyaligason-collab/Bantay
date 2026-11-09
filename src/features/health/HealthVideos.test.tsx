import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HealthVideos } from './HealthVideos'
import css from './health.css?raw'
import { DISCOVER_SET, forSub, SUBS, VIDEOS } from './library/videosLogic'
import { mediaName } from '../look/media/MediaCard'

afterEach(cleanup)
const cards = () => Array.from(screen.getByTestId('hv-grid').querySelectorAll('[data-testid^="hv-"]'))

describe('Health videos (S25)', () => {
  it('seven chips, none selected; four cards show with Philippine sources first, and Show more adds four at a time', () => {
    render(<HealthVideos />)
    const chips = within(screen.getByRole('group', { name: 'Video topic' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['Heart and BP', 'Diabetes', 'Infections', 'First aid', 'Mind and sleep', 'Food', 'Kids'])
    expect(chips.every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(cards()).toHaveLength(4)
    expect(cards().every((c) => c.querySelector('.md-flag')!.textContent === 'Philippines')).toBe(true) // 40 clips, Philippine ones lead
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    expect(cards()).toHaveLength(8)
  })
  it('a chip filters (aria-pressed), the stills use mqdefault from i.ytimg.com, and tapping it again shows all', () => {
    render(<HealthVideos />)
    const chip = screen.getByRole('button', { name: 'Kids' })
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(cards()).toHaveLength(2) // counted by hand: two Kids videos
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull()
    const img = cards()[0]!.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/)
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(cards()).toHaveLength(4)
  })
  it('each card shows title, source, minutes and a Philippines tag only for a Philippine source', () => {
    render(<HealthVideos />)
    fireEvent.click(screen.getByRole('button', { name: 'Heart and BP' }))
    for (const c of cards()) {
      const id = c.getAttribute('data-testid')!.slice(3)
      const v = forSub('heart-bp').find((x) => x.id === id)!
      expect(c.textContent).toContain(v.title)
      expect(c.textContent).toContain(v.source)
      expect(c.querySelector('.md-len')!.textContent).toBe(`${v.minutes} min`)
      expect(!!c.querySelector('.md-flag')).toBe(!!v.ph)
    }
  })
  it('a tap opens the card across the grid and plays it in LiteVideo (no-cookie embed), one at a time', () => {
    render(<HealthVideos />)
    const first = cards()[0]!
    fireEvent.click(first.querySelector('button.md')!)
    const open = screen.getByTestId(first.getAttribute('data-testid')!)
    expect(open.hasAttribute('data-open')).toBe(true)
    expect(open.querySelector('.hv-open')).toBeNull() // hv-open is the full-row link style; the player wrapper must not carry it
    expect(open.querySelector('.hv-opened')).not.toBeNull()
    expect(open.querySelector('iframe')!.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?/)
    fireEvent.click(cards()[1]!.querySelector('button.md')!)
    expect(screen.getByTestId(first.getAttribute('data-testid')!).hasAttribute('data-open')).toBe(false) // the first folds back to its still
  })
  it('each card is one button with a play icon, named "Video, [tag,] title, channel, length"; opening it moves focus into the player', async () => {
    render(<HealthVideos />)
    const first = cards()[0]!
    const id = first.getAttribute('data-testid')!.slice(3)
    const v = VIDEOS.find((x) => x.id === id)!
    const btn = first.querySelector('button.md')!
    expect(btn.querySelector('.md-play svg')).toBeTruthy()
    expect(btn.getAttribute('aria-label')).toBe(mediaName(v.title, v.source, v.minutes, v.ph ? 'Philippines' : undefined))
    expect(btn.getAttribute('aria-label')).toBe(`Video, ${v.ph ? 'Philippines, ' : ''}${v.title}, ${v.source}${v.minutes != null ? `, ${v.minutes} minutes` : ''}`)
    fireEvent.click(btn)
    const box = screen.getByTestId(`hv-${id}`).querySelector('.hv-opened')!
    await waitFor(() => expect(box.contains(document.activeElement)).toBe(true))
  })
  it('all rows (Health already has its one hero, so no [data-hero] here); one column with no side-swipe row', () => {
    render(<HealthVideos />)
    expect(cards().map((c) => c.querySelector('.md')!.className.includes('md-row'))).toEqual([true, true, true, true])
    expect(document.querySelectorAll('[data-hero]')).toHaveLength(0)
    expect(screen.getByTestId('health-videos').querySelector('.carousel, .more-grid')).toBeNull()
    expect(css).not.toMatch(/\.hv-vc\[data-open\] \{[^}]*border:/) // a card has a shadow or a border, never both
  })
  it('nothing loads from YouTube before a tap: stills only, no iframe', () => {
    render(<HealthVideos />)
    expect(screen.getByTestId('health-videos').querySelector('iframe')).toBeNull()
    for (const img of Array.from(screen.getByTestId('health-videos').querySelectorAll('img'))) expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\//)
  })
  it('every chip has a video; the stylesheet gives chips a 44 px height and lets the row wrap with no side scroll', () => {
    render(<HealthVideos />)
    expect(SUBS.every((s) => forSub(s.sub).length > 0)).toBe(true)
    expect(screen.getByRole('group', { name: 'Video topic' }).className).toBe('hv-chips') // jsdom has no layout, so the rules are read from the CSS text
    const rule = (sel: string) => css.split('\n').find((l) => l.startsWith(sel + ' {'))!
    expect(rule('.hv-chips')).toContain('flex-wrap: wrap')
    expect(rule('.hv-chips')).not.toMatch(/overflow-x/)
    expect(rule('.hv-chip')).toContain('min-height: 44px')
  })
  it('the section has the id the For you "More" link scrolls to, and no S25 health-only clip is in the Discover set', () => {
    render(<HealthVideos />)
    expect(document.getElementById('health-videos')).not.toBeNull()
    expect(VIDEOS.filter((v) => v.healthOnly)).toHaveLength(16)
    expect(DISCOVER_SET).toHaveLength(27)
    expect(DISCOVER_SET.some((v) => v.healthOnly)).toBe(false)
  })
})
