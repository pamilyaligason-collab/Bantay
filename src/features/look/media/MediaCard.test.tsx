import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import css from './media.css?raw'
import { MediaCard, mediaName } from './MediaCard'
import { MediaList } from './MediaList'

afterEach(cleanup)
const base = { id: 'abcdefghijk', title: 'Plant a small garden', channel: 'Garden Channel' }

describe('MediaCard', () => {
  it('is one link named "Video, title, channel, length" with a 16:9 still, a length badge and a play circle', () => {
    render(<MediaCard {...base} variant="hero" minutes={7} href="#discover/watch" testId="c" />)
    const a = screen.getByTestId('c')
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('#discover/watch')
    expect(a.getAttribute('aria-label')).toBe('Video, Plant a small garden, Garden Channel, 7 min')
    expect(screen.getByRole('link', { name: 'Video, Plant a small garden, Garden Channel, 7 min' })).toBe(a)
    const img = a.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg')
    expect([img.getAttribute('alt'), img.getAttribute('loading'), img.getAttribute('decoding'), img.getAttribute('referrerpolicy'), img.getAttribute('width'), img.getAttribute('height')]).toEqual(['', 'lazy', 'async', 'no-referrer', '320', '180'])
    expect(a.querySelector('.md-len')!.textContent).toBe('7 min')
    expect(a.querySelector('.md-play svg')).toBeTruthy() // the house play icon, not a glyph
    expect(a.querySelectorAll('a, button')).toHaveLength(0) // no card inside a card, one control
  })
  it('leaves the length out of the name and the badge when it is not recorded', () => {
    expect(mediaName('T', 'C', null)).toBe('Video, T, C')
    expect(mediaName('T', 'C', 0)).toBe('Video, T, C')
    render(<MediaCard {...base} variant="row" minutes={null} href="#x" testId="c" />)
    expect(screen.getByTestId('c').querySelector('.md-len')).toBeNull()
  })
  it('without an href it is one button that says whether it is picked', () => {
    const onClick = vi.fn()
    render(<MediaCard {...base} variant="row" age="40 min ago" pressed onClick={onClick} testId="c" />)
    const b = screen.getByRole('button', { name: 'Video, Plant a small garden, Garden Channel, 40 min ago' })
    expect(b.getAttribute('aria-pressed')).toBe('true')
    expect(b.querySelector('.md-meta')!.textContent).toBe('Garden Channel · 40 min ago')
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it('a still that cannot load is removed and the same-size placeholder stays; a tag shows only when given', () => {
    const { container } = render(<MediaCard {...base} variant="row" href="#x" />)
    expect(container.querySelector('.md-flag')).toBeNull()
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.md-pic')).toBeTruthy()
    cleanup()
    const t = render(<MediaCard {...base} variant="row" href="#x" tag="Most watched" note="Use less salt" />)
    expect(t.container.querySelector('.md-flag')!.textContent).toBe('Most watched')
    expect(t.container.querySelector('a')!.getAttribute('aria-label')).toBe('Video, Plant a small garden, Garden Channel, Use less salt, Most watched')
    expect(t.container.querySelector('.md-line')!.textContent).toBe('Use less salt')
    expect(t.container.querySelector('a')!.textContent!.trim()).toBe('Plant a small garden Garden Channel Use less salt Most watched') // WCAG 2.5.3: the name holds every visible word, in this order
  })
})

describe('media.css (D-180)', () => {
  it('16:9 still with a placeholder, 2-line title, 128 px row still, focus ring, 15 px meta and badge', () => {
    expect(css).toMatch(/\.md-pic \{[^}]*aspect-ratio: 16 \/ 9[^}]*background: var\(--tint-slate/)
    expect(css).toMatch(/\.md-title \{[^}]*-webkit-line-clamp: 2/)
    expect(css).toMatch(/\.md-row \.md-pic \{ width: 128px/)
    expect(css).toMatch(/\.md-row \{[^}]*min-height: 88px/)
    expect(css).toMatch(/\.md:focus-visible \{ outline: 2px solid/)
    expect(css).toMatch(/\.md-len \{[^}]*font-size: var\(--fs-meta, 15px\)/)
    expect(css).toMatch(/\.md-meta \{[^}]*font-size: var\(--fs-meta, 15px\)/)
    expect(css).toMatch(/\.md-list \{[^}]*gap: var\(--card-gap, 12px\)/)
  })
  it('never a border and a shadow together on the card', () => {
    const rule = /\.md \{([^}]*)\}/.exec(css)![1]!
    expect(rule).toMatch(/box-shadow/)
    expect(rule).toMatch(/border: 0/)
  })
  it('half falls back to a row under 360 px', () => {
    expect(css).toMatch(/@media \(max-width: 359px\) \{[^@]*\.md-half \{ flex-direction: row/)
  })
})

describe('MediaList', () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => <MediaCard key={i} {...base} id={'abcdefghi' + String(i).padStart(2, '0')} title={'Video ' + i} variant="row" href="#x" />)
  it('shows 4, adds 4 at a time and folds back, in one column', () => {
    render(<MediaList label="Videos">{cards(10)}</MediaList>)
    expect(screen.getAllByRole('link')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(screen.getAllByRole('link')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })
  it('has no button when 4 or fewer', () => {
    render(<MediaList label="Videos">{cards(4)}</MediaList>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
