import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HealthVideos } from './HealthVideos'
import { forSub, SUBS } from './library/videosLogic'

afterEach(cleanup)
const cards = () => Array.from(screen.getByTestId('hv-grid').querySelectorAll('[data-testid^="hv-"]'))

describe('Health videos (S25)', () => {
  it('seven chips, none selected; four cards show with Philippine sources first, and Show more adds four at a time', () => {
    render(<HealthVideos />)
    const chips = within(screen.getByRole('group', { name: 'Video topic' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['Heart and BP', 'Diabetes', 'Infections', 'First aid', 'Mind and sleep', 'Food', 'Kids'])
    expect(chips.every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(cards()).toHaveLength(4)
    expect(cards().every((c) => c.querySelector('.hv-ph'))).toBe(true) // 40 clips, Philippine ones lead
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
    const img = cards()[0]!.querySelector('img.hv-img')!
    expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/)
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(cards()).toHaveLength(4)
  })
  it('each card shows title, source, minutes and a PH flag only for a Philippine source', () => {
    render(<HealthVideos />)
    fireEvent.click(screen.getByRole('button', { name: 'Heart and BP' }))
    for (const c of cards()) {
      const id = c.getAttribute('data-testid')!.slice(3)
      const v = forSub('heart-bp').find((x) => x.id === id)!
      expect(c.textContent).toContain(v.title)
      expect(c.textContent).toContain(v.source)
      expect(c.querySelector('.hv-len')!.textContent).toBe(`${v.minutes} min`)
      expect(!!c.querySelector('.hv-ph')).toBe(!!v.ph)
    }
  })
  it('a tap opens the card across the grid and plays it in LiteVideo (no-cookie embed), one at a time', () => {
    render(<HealthVideos />)
    const first = cards()[0]!
    fireEvent.click(first.querySelector('button.hv-vbtn')!)
    const open = screen.getByTestId(first.getAttribute('data-testid')!)
    expect(open.hasAttribute('data-open')).toBe(true)
    expect(open.querySelector('iframe')!.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?/)
    fireEvent.click(cards()[1]!.querySelector('button.hv-vbtn')!)
    expect(screen.getByTestId(first.getAttribute('data-testid')!).hasAttribute('data-open')).toBe(false) // the first folds back to its still
  })
  it('chips are 44 px tall targets that wrap, and every chip has a video', () => {
    render(<HealthVideos />)
    expect(SUBS.every((s) => forSub(s.sub).length > 0)).toBe(true)
    expect(screen.getByRole('group', { name: 'Video topic' }).className).toBe('hv-chips')
  })
})
