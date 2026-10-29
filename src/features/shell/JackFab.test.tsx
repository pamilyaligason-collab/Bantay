import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASK_EVENT } from '../assistant/Assistant'
import { JackFab } from './JackFab'

vi.mock('./AskSheet', () => ({ AskSheet: () => <div role="dialog" aria-label="Ask sheet" /> }))
// fake-indexeddb schedules its work with setTimeout, so faking the clock would stall Dexie. The kv is a plain in-memory map here, always loaded.
const store = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./useKv', () => ({
  useKv: <T,>(key: string, init: T): [T, (v: T) => void, boolean] => {
    const [val, setVal] = useState<T>(store.has(key) ? (store.get(key) as T) : init)
    return [val, (v: T) => { store.set(key, v); setVal(v) }, true]
  }
}))

let asked = 0
const onAsk = () => { asked++ }
beforeEach(() => { store.clear(); asked = 0; window.addEventListener(ASK_EVENT, onAsk); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { cleanup(); window.removeEventListener(ASK_EVENT, onAsk); vi.clearAllTimers(); vi.useRealTimers() })

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const fab = () => screen.queryByRole('button', { name: 'Ask Bantay' })

describe('JackFab visibility', () => {
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

describe('JackFab actions', () => {
  it('a tap opens Jack (the assistant event) and not the choice sheet', () => {
    render(<JackFab tab="today" hash="#today" />)
    fireEvent.click(fab()!)
    expect(asked).toBe(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('press and hold 500 ms opens the choice sheet, and the click after the release does not also open Jack', () => {
    render(<JackFab tab="today" hash="#today" />)
    fireEvent.pointerDown(fab()!)
    tick(499)
    expect(screen.queryByRole('dialog')).toBeNull()
    tick(1)
    expect(screen.getByRole('dialog', { name: 'Ask sheet' })).toBeTruthy()
    fireEvent.pointerUp(fab()!)
    fireEvent.click(fab()!)
    expect(asked).toBe(0)
  })
  it('a hold whose release never reaches the button does not swallow the next tap', () => {
    render(<JackFab tab="today" hash="#today" />)
    fireEvent.pointerDown(fab()!)
    tick(500) // sheet opens under the finger; no pointerup or click lands on the button
    fireEvent.pointerDown(fab()!)
    fireEvent.pointerUp(fab()!)
    fireEvent.click(fab()!)
    expect(asked).toBe(1)
  })
  it('a short press cancels the timer', () => {
    render(<JackFab tab="today" hash="#today" />)
    fireEvent.pointerDown(fab()!)
    tick(200)
    fireEvent.pointerUp(fab()!)
    tick(1000)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('right click (and the Android long-press menu) opens the choice sheet', () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(fireEvent.contextMenu(fab()!)).toBe(false) // default prevented: no browser menu
    expect(screen.getByRole('dialog', { name: 'Ask sheet' })).toBeTruthy()
    expect(asked).toBe(0)
  })
})

describe('JackFab coach mark', () => {
  it('shows "Ask me anything" and the hold hint on Today; seen only once exactly 8 s have passed', () => {
    render(<JackFab tab="today" hash="#today" />)
    expect(screen.getByRole('status').textContent).toBe('Ask me anything. Hold for the camera.')
    tick(7999)
    expect(store.get('askHintSeen')).toBeUndefined()
    expect(screen.queryByRole('status')).not.toBeNull()
    tick(1)
    expect(store.get('askHintSeen')).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
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
