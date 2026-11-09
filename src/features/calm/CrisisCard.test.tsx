// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import css from './calm.css?raw'
import { parse, ratio } from '../look/contrastMath'
const tr = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../admin/events', () => ({ track: tr }))
import hotlines from '../../data/safety/hotlines.json'
import CrisisCard, { TalkCard } from './CrisisCard'
afterEach(cleanup)

describe('CrisisCard', () => {
  it('Call 911 is a real tel link with a 44 px target, even with no rows', () => {
    render(<CrisisCard rows={[]} />)
    const a = screen.getByRole('link', { name: 'Call 911' })
    expect(a.getAttribute('href')).toBe('tel:911')
    expect(a.className).toMatch(/cm-911/)
    expect(screen.queryByText(/Call 1553/)).toBeNull()
  })
  it('shows the first row name as given, not a hand-typed promise', () => {
    render(<CrisisCard />)
    expect(screen.getByText('NCMH Crisis Hotline (24/7, landline toll-free)')).toBeTruthy()
    expect(screen.queryByText(/free to call/)).toBeNull()
  })
  it('labels each mobile number with its network', () => {
    render(<CrisisCard />)
    expect(screen.getByRole('link', { name: /0917-899-8727.*Globe\/TM/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /0919-057-1553.*Smart\/TNT/ })).toBeTruthy()
  })
  it('an UNKNOWN row is not shown', () => {
    const ncmh = hotlines.find((r) => r.id === 'hl-ncmh')!
    render(<CrisisCard rows={[{ ...ncmh, status: 'UNKNOWN' }]} />)
    expect(screen.queryByText(/1553/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Call 911' })).toBeTruthy()
  })
})

describe('TalkCard (quiet Today card, S27)', () => {
  it('names the card, leads with 911 in words, and See hotlines opens #calm with a 48 px target; tracks card_talk on tap only', () => {
    tr.mockClear()
    render(<TalkCard />)
    expect(screen.getByRole('heading', { name: 'Here if you need to talk' })).toBeTruthy()
    expect(screen.getByText(/In an emergency, call 911\./)).toBeTruthy()
    const talk = screen.getByRole('link', { name: /See hotlines/ })
    expect(talk.getAttribute('href')).toBe('#calm')
    expect(tr).not.toHaveBeenCalled()
    fireEvent.click(talk)
    expect(tr).toHaveBeenCalledTimes(1)
    expect(tr).toHaveBeenCalledWith('action', 'card_talk')
    expect(css).toMatch(/\.cm-talk-btn \{[^}]*min-height: 48px/)
  })
  it('is not the hero (no --shadow-hero), teal, and not SOS red', () => {
    expect(/\.cm-talk \{[^}]*\}/.exec(css)![0]).not.toMatch(/--shadow-hero/)
    expect(css).not.toMatch(/\.cm-talk[^{]*\{[^}]*(#B42318|#C8372D|var\(--red\)|var\(--danger-bg\))/)
  })
  const pick = (block: string, name: string) => parse(new RegExp(`--talk-${name}: (#[0-9A-Fa-f]{6})`).exec(block)![1]!)[0]
  const light = /\.cm-talk \{ (--talk-bg[^}]*?);\s*display/.exec(css)![1]!
  const dark = /:root\[data-theme="dark"\] \.cm-talk \{([^}]*)\}/.exec(css)![1]!
  it.each([['light', light], ['dark', dark]])('%s: title, sub line and See hotlines button text are >= 4.5:1 on their fill', (_n, b) => {
    expect(ratio(pick(b, 'ink'), pick(b, 'bg'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(pick(b, 'sub'), pick(b, 'bg'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(pick(b, 'btn'), pick(b, 'bg'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(pick(b, 'icon'), pick(b, 'bg'))).toBeGreaterThanOrEqual(3) // muted icon
  })
})
