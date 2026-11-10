import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JackFab, coversText } from './JackFab'
import { openSos } from '../sos/openSos'

const sosMounts = vi.hoisted(() => ({ n: 0 }))
vi.mock('../sos/SosScreen', async () => {
  const { useEffect } = await import('react')
  return { default: () => { useEffect(() => { sosMounts.n++ }, []); return <div data-testid="sos-screen" /> } }
})

vi.mock('./JackSheet', () => ({ JackSheet: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Jack"><button onClick={onClose}>x</button></div> }))
// fake-indexeddb schedules its work with setTimeout, so faking the clock would stall Dexie. The kv is a plain in-memory map here, always loaded.
const viewing = vi.hoisted(() => ({ on: false }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: viewing.on, personId: null, name: '' }) }))
const store = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./useKv', () => ({
  useKv: <T,>(key: string, init: T): [T, (v: T) => void, boolean] => {
    const [val, setVal] = useState<T>(store.has(key) ? (store.get(key) as T) : init)
    return [val, (v: T) => { store.set(key, v); setVal(v) }, true]
  }
}))

beforeEach(() => { viewing.on = false; store.clear(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const fab = () => screen.queryByRole('button', { name: 'Jack: help, scan, chat' })

describe('JackFab visibility', () => {
  it('S16: hides while a storm or quake warning marks the screen data-nofab, and returns when it goes', async () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(fab()).not.toBeNull()
    const warn = document.createElement('section')
    warn.setAttribute('data-nofab', '')
    await act(async () => { document.body.appendChild(warn); await Promise.resolve() })
    await vi.waitFor(() => expect(fab()).toBeNull())
    await act(async () => { warn.remove(); await Promise.resolve() })
    await vi.waitFor(() => expect(fab()).not.toBeNull())
  })
  it('shows on each of the five tabs', () => {
    for (const tab of ['today', 'health', 'discover', 'family', 'safety'] as const) {
      const { unmount } = render(<JackFab tab={tab} hash={'#' + tab} />)
      expect(fab(), tab).not.toBeNull()
      unmount()
    }
  })
  it('renders a round button with the Jack picture', () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(fab()!.className).toBe('sh-jackfab')
    expect(fab()!.querySelector('img')).not.toBeNull()
  })
  it('Simple mode: no button, no hint, no 8 s timer, so the hint is never marked seen', () => {
    store.set('mode.simple', true)
    render(<JackFab tab="today" hash="#today" />)
    expect(fab()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    tick(8000)
    expect(screen.queryByRole('status')).toBeNull()
    expect(store.get('askHintSeen')).toBeUndefined()
  })
  it.each(['#privacy', '#sharing', '#medid/p1', '#gobag', '#docs', '#weather', '#family/people/p1', '#discover/learn/article-1'])('hidden on %s (the screen draws its own header)', (hash) => {
    render(<JackFab tab="today" hash={hash} />)
    expect(fab()).toBeNull()
  })
  it.each(['#today', '#family/plan', '#family/people', '#discover', '#discover/learn', '#discover/news'])('shown on %s', (hash) => {
    render(<JackFab tab="today" hash={hash} />)
    expect(fab()).not.toBeNull()
  })
  it('hidden off the tabs (Me, notifications, admin, scan pass tab null)', () => {
    render(<JackFab tab={null} hash="#me" />)
    expect(fab()).toBeNull()
  })
  it('marks .bt[data-jack] only while shown, so the page content keeps clear of it', () => {
    const bt = document.createElement('div'); bt.className = 'bt'; document.body.append(bt)
    const { rerender, unmount } = render(<JackFab tab="today" hash="#today" />)
    expect(bt.hasAttribute('data-jack')).toBe(true)
    rerender(<JackFab tab="today" hash="#privacy" />)
    expect(bt.hasAttribute('data-jack')).toBe(false)
    rerender(<JackFab tab="today" hash="#today" />)
    unmount()
    expect(bt.hasAttribute('data-jack')).toBe(false)
    bt.remove()
  })
})

describe('JackFab hide on scroll', () => {
  it('slides out on scroll down, returns on scroll up, after 600 ms of rest and at the top', () => {
    vi.useFakeTimers()
    const bt = document.createElement('div'); bt.className = 'bt'; const sc = document.createElement('div'); sc.className = 'scroll'; bt.append(sc); document.body.append(bt)
    render(<JackFab tab="today" hash="#today" />)
    const scrollTo = (y: number) => { sc.scrollTop = y; act(() => { sc.dispatchEvent(new Event('scroll')) }) }
    const away = () => fab()!.hasAttribute('data-away')
    expect(away()).toBe(false)
    scrollTo(200); expect(away()).toBe(true)
    scrollTo(150); expect(away()).toBe(false) // scroll up
    scrollTo(400); expect(away()).toBe(true)
    act(() => { vi.advanceTimersByTime(599) }); expect(away()).toBe(true)
    act(() => { vi.advanceTimersByTime(2) }); expect(away()).toBe(false) // stopped
    scrollTo(900); expect(away()).toBe(true)
    scrollTo(0); expect(away()).toBe(false) // top
    scrollTo(300); expect(away()).toBe(true)
    const f = fab()!; const real = f.matches.bind(f)
    ;(f as { matches: unknown }).matches = (q: string) => (q === ':focus-visible' ? true : real(q)); fireEvent.focus(f); expect(away()).toBe(false) // keyboard focus brings him back
    scrollTo(900); fireEvent.click(fab()!); expect(screen.getByRole('dialog', { name: 'Jack' })).toBeTruthy(); expect(away()).toBe(false)
    bt.remove(); vi.useRealTimers()
  })
  it('S29: a route change while he is slid away brings him back (the effect cleanup drops the 600 ms timer)', () => {
    vi.useFakeTimers()
    const bt = document.createElement('div'); bt.className = 'bt'; const sc = document.createElement('div'); sc.className = 'scroll'; bt.append(sc); document.body.append(bt)
    const { rerender } = render(<JackFab tab="family" hash="#family" />)
    sc.scrollTop = 300; act(() => { sc.dispatchEvent(new Event('scroll')) })
    expect(fab()!.hasAttribute('data-away')).toBe(true)
    rerender(<JackFab tab="family" hash="#family/people" />)
    expect(fab()!.hasAttribute('data-away')).toBe(false)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(fab()!.hasAttribute('data-away')).toBe(false)
    bt.remove(); vi.useRealTimers()
  })
})

describe('JackFab coach mark with scroll', () => {
  it('the bubble is hidden while Jack is away and shown again when he is back', () => {
    vi.useFakeTimers()
    const bt = document.createElement('div'); bt.className = 'bt'; const sc = document.createElement('div'); sc.className = 'scroll'; bt.append(sc); document.body.append(bt)
    render(<JackFab tab="today" hash="#today" />)
    const hint = () => screen.getByRole('status', { hidden: true }) as HTMLElement
    expect(hint().style.visibility).toBe('')
    sc.scrollTop = 300; act(() => { sc.dispatchEvent(new Event('scroll')) })
    expect(fab()!.hasAttribute('data-away')).toBe(true)
    expect(hint().style.visibility).toBe('hidden')
    act(() => { vi.advanceTimersByTime(601) })
    expect(hint().style.visibility).toBe('')
    bt.remove(); vi.useRealTimers()
  })
})

describe('JackFab actions', () => {
  it('a tap opens the Jack sheet; closing it removes the sheet', () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(fab()!)
    expect(screen.getByRole('dialog', { name: 'Jack' })).toBeTruthy()
    fireEvent.click(screen.getByText('x'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('has the test id and is one tap only: no hold timer, no context menu sheet', () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(fab()!.getAttribute('data-testid')).toBe('jack')
    fireEvent.pointerDown(fab()!); tick(1000)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.contextMenu(fab()!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('JackFab coach mark', () => {
  it('shows "Help, scan or chat" on Today; seen only once exactly 8 s have passed', () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(screen.getByRole('status').textContent).toBe('Help, scan or chat')
    tick(7999)
    expect(store.get('askHintSeen')).toBeUndefined()
    expect(screen.queryByRole('status')).not.toBeNull()
    tick(1)
    expect(store.get('askHintSeen')).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('S29: the 8 s clock stops while Jack is away (bubble hidden) and starts again when he is back', () => {
    const bt = document.createElement('div'); bt.className = 'bt'; const sc = document.createElement('div'); sc.className = 'scroll'; bt.append(sc); document.body.append(bt)
    render(<JackFab tab="today" hash="#today" />)
    const scrollTo = (y: number) => { sc.scrollTop = y; act(() => { sc.dispatchEvent(new Event('scroll')) }) }
    tick(5000)
    scrollTo(200) // away: 600 ms rest timer runs, the hint is hidden
    expect(fab()!.hasAttribute('data-away')).toBe(true)
    tick(599)
    expect(fab()!.hasAttribute('data-away')).toBe(true)
    tick(7000) // would have passed 8 s in total if the clock had kept running
    expect(fab()!.hasAttribute('data-away')).toBe(false)
    expect(store.get('askHintSeen')).toBeUndefined()
    tick(7999)
    expect(store.get('askHintSeen')).toBeUndefined()
    tick(1)
    expect(store.get('askHintSeen')).toBe(true)
    bt.remove()
  })
  it('viewing as someone: no hint (it would sit on the locked Log) and it is not counted as seen', () => {
    viewing.on = true
    render(<JackFab tab="today" hash="#today" />)
    expect(fab()).not.toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    tick(8000)
    expect(store.get('askHintSeen')).toBeUndefined()
  })
  it('not on other tabs', () => {
    render(<JackFab tab="health" hash="#health" />)
    expect(vi.getTimerCount()).toBe(0)
    tick(8000)
    expect(screen.queryByRole('status')).toBeNull()
    expect(store.get('askHintSeen')).toBeUndefined()
  })
  it('a tap counts as seen', () => {
    render(<JackFab tab="today" hash="#today" />)
    fireEvent.click(fab()!)
    expect(store.get('askHintSeen')).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('JackFab owns the SOS screen opened from a warning card', () => {
  it('opens on the sos event and stays while the warning (data-nofab) comes and goes', async () => {
    render(<JackFab tab="today" hash="#today" />)
    const warn = document.createElement('section')
    warn.setAttribute('data-nofab', '')
    await act(async () => { document.body.appendChild(warn); await Promise.resolve() })
    await vi.waitFor(() => expect(fab()).toBeNull()) // Jack is hidden, yet the event still opens SOS
    sosMounts.n = 0
    act(() => openSos())
    expect(screen.getByTestId('sos-screen')).toBeTruthy()
    await act(async () => { warn.remove(); await Promise.resolve() })
    await vi.waitFor(() => expect(fab()).not.toBeNull())
    expect(screen.getByTestId('sos-screen')).toBeTruthy()
    await act(async () => { document.body.appendChild(warn); await Promise.resolve() })
    await vi.waitFor(() => expect(fab()).toBeNull())
    expect(sosMounts.n).toBe(1) // a remount would start a second SOS and alarm the family again
    warn.remove()
  })
})

describe('coversText (S29: the hint never sits on a tap target)', () => {
  const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) }) as DOMRect
  const hint = { left: 100, right: 300, top: 400, bottom: 460 }
  const setup = (tag: string, attrs: Record<string, string>, rect: DOMRect) => {
    document.body.innerHTML = '<div class="bt"><div class="scroll"></div></div>'
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.getBoundingClientRect = () => rect
    document.querySelector('.scroll')!.appendChild(el)
  }
  afterEach(() => { document.body.innerHTML = '' })
  it.each([['a', { href: '#x' }], ['button', {}], ['div', { role: 'button' }]])('a %s under the hint hides it', (tag, attrs) => {
    setup(tag, attrs, box(150, 420, 80, 80))
    expect(coversText(hint)).toBe(true)
  })
  it('a link clear of the hint, or a plain div under it, does not', () => {
    setup('a', { href: '#x' }, box(150, 600, 80, 80))
    expect(coversText(hint)).toBe(false)
    setup('div', {}, box(150, 420, 80, 80))
    expect(coversText(hint)).toBe(false)
  })
})
