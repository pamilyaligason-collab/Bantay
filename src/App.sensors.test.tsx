import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { db } from './db'
import { ldb } from './features/log/store'
import { STATE_KEY, type HealthBridge } from './features/sensors/health'

const phone = vi.hoisted(() => ({ native: true, bridge: null as unknown as HealthBridge }))
vi.mock('./features/sensors/bridge', async (orig) => ({ ...(await orig<typeof import('./features/sensors/bridge')>()), isNative: () => phone.native, capgoBridge: () => phone.bridge }))
vi.mock('./features/auth/session', async (orig) => ({ ...(await orig<typeof import('./features/auth/session')>()), getMember: async () => ({ userId: 'u', personId: 'me-p', role: 'member', handle: null }) }))

const H = 3_600_000
const hourStart = Math.floor(Date.now() / H) * H - 2 * H
const finished = { startDate: new Date(hourStart).toISOString(), endDate: new Date(hourStart + H).toISOString(), value: 321 }
const settle = () => new Promise((r) => setTimeout(r, 60))
const shown = () => document.dispatchEvent(new Event('visibilitychange'))

function fakePhone(over: Partial<HealthBridge> = {}) {
  const b = { platform: 'android', isAvailable: vi.fn(async () => true), request: vi.fn(async () => true), requestAll: vi.fn(async () => []), granted: vi.fn(async () => true), read: vi.fn(async () => []), readSteps: vi.fn(async () => [finished]), ...over }
  phone.bridge = b as unknown as HealthBridge
  return b as unknown as Record<'isAvailable' | 'request' | 'requestAll' | 'granted' | 'readSteps', ReturnType<typeof vi.fn>>
}

beforeEach(async () => {
  location.hash = ''
  phone.native = true
  await Promise.all([db.kv.clear(), db.outbox.clear(), ldb.activity.clear()])
})
afterEach(cleanup)

describe('the app shell keeps the phone\'s steps coming', () => {
  it('on a phone with steps on: opening the app reads Health Connect and queues the hour, showing it again reads again, leaving stops', async () => {
    await db.kv.put({ key: STATE_KEY, value: { enabled: ['steps'], cursor: {} } })
    const b = fakePhone()
    const { unmount } = render(<App />)
    await waitFor(async () => expect((await ldb.activity.where('personId').equals('me-p').toArray()).map((a) => a.steps)).toEqual([321]))
    expect(await db.outbox.where('table').equals('activity').count()).toBe(1)
    await waitFor(() => { shown(); expect(b.readSteps.mock.calls.length).toBeGreaterThan(1) })
    expect(b.request).not.toHaveBeenCalled()
    expect(b.requestAll).not.toHaveBeenCalled()
    await settle()
    const before = b.readSteps.mock.calls.length
    unmount()
    shown()
    await settle()
    expect(b.readSteps.mock.calls.length).toBe(before)
  })
  it('on the web it does nothing, even with state saved', async () => {
    await db.kv.put({ key: STATE_KEY, value: { enabled: ['steps'], cursor: {} } })
    phone.native = false
    const b = fakePhone()
    render(<App />)
    await settle()
    expect(b.granted).not.toHaveBeenCalled()
    expect(b.readSteps).not.toHaveBeenCalled()
    expect(await ldb.activity.count()).toBe(0)
  })
  it('with no sensor on it does not touch Health Connect or ask for anything', async () => {
    const b = fakePhone()
    render(<App />)
    await settle()
    for (const f of [b.isAvailable, b.granted, b.readSteps, b.request, b.requestAll]) expect(f).not.toHaveBeenCalled()
  })
  it('a plugin that fails to load leaves the app up and stores nothing', async () => {
    await db.kv.put({ key: STATE_KEY, value: { enabled: ['steps'], cursor: {} } })
    const b = fakePhone({ granted: vi.fn(async () => { throw new Error('plugin did not load') }) })
    render(<App />)
    await waitFor(() => expect(b.granted).toHaveBeenCalled())
    await settle()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
    expect(await ldb.activity.count()).toBe(0)
  })
})
