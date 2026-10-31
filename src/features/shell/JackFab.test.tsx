import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JackFab } from './JackFab'

vi.mock('./JackSheet', () => ({ JackSheet: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Jack"><button onClick={onClose}>x</button></div> }))
// fake-indexeddb schedules its work with setTimeout, so faking the clock would stall Dexie. The kv is a plain in-memory map here, always loaded.
const store = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./useKv', () => ({
  useKv: <T,>(key: string, init: T): [T, (v: T) => void, boolean] => {
    const [val, setVal] = useState<T>(store.has(key) ? (store.get(key) as T) : init)
    return [val, (v: T) => { store.set(key, v); setVal(v) }, true]
  }
}))

beforeEach(() => { store.clear(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
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
