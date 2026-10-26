import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

vi.mock('./AskSheet', () => ({ AskSheet: () => null }))
const alerts = vi.hoisted(() => ({ unseen: 0 }))
vi.mock('../notify/useAlerts', () => ({ useUnseenAlerts: () => alerts.unseen }))
// fake-indexeddb schedules its work with setTimeout, so faking the clock would stall Dexie. The kv is a plain in-memory map here, always loaded.
const store = vi.hoisted(() => new Map<string, unknown>())
vi.mock('./useKv', () => ({
  useKv: <T,>(key: string, init: T): [T, (v: T) => void, boolean] => {
    const [val, setVal] = useState<T>(store.has(key) ? (store.get(key) as T) : init)
    return [val, (v: T) => { store.set(key, v); setVal(v) }, true]
  }
}))

// Fake setTimeout/clearTimeout are installed before render; no real-time waits anywhere.
beforeEach(() => { store.clear(); alerts.unseen = 0; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('TabBar coach mark', () => {
  it('shows "Scan papers here too" on Today; seen only once exactly 8 s have passed', () => {
    render(<TabBar active="today" />)
    expect(screen.getByRole('status').textContent).toBe('Scan papers here too')
    tick(7999)
    expect(store.get('askHintSeen')).toBeUndefined()
    expect(screen.queryByRole('status')).not.toBeNull()
    tick(1)
    expect(store.get('askHintSeen')).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('Simple mode: no hint and no 8 s timer, so it is never marked seen', () => {
    store.set('mode.simple', true)
    render(<TabBar active="today" />)
    expect(vi.getTimerCount()).toBe(0)
    tick(8000)
    expect(screen.queryByRole('status')).toBeNull()
    expect(store.get('askHintSeen')).toBeUndefined()
  })
  it('not on other tabs', () => {
    render(<TabBar active="health" />)
    expect(vi.getTimerCount()).toBe(0)
    tick(8000)
    expect(screen.queryByRole('status')).toBeNull()
    expect(store.get('askHintSeen')).toBeUndefined()
  })
})

describe('TabBar family badge (D-78)', () => {
  it('no badge while every alert is seen', () => {
    render(<TabBar active="today" />)
    expect(screen.queryByRole('img', { name: /new alert/ })).toBeNull()
  })
  it('a badge on the Family tab only, saying how many alerts are new', () => {
    alerts.unseen = 3
    render(<TabBar active="today" />)
    const badge = screen.getByRole('img', { name: '3 new alerts' })
    expect(badge.closest('button')!.textContent).toContain('Family')
    expect(screen.getAllByRole('img', { name: /new alert/ })).toHaveLength(1)
    cleanup()
    alerts.unseen = 1
    render(<TabBar active="family" />)
    expect(screen.getByRole('img', { name: '1 new alert' })).toBeTruthy()
  })
})
