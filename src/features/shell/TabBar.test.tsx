import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { TabBar } from './TabBar'

vi.mock('./AskSheet', () => ({ AskSheet: () => null }))

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const seen = async () => (await db.kv.get('askHintSeen'))?.value
// Dexie and testing-library need the real clock, so capture the coach mark's own 8000 ms timer instead of faking time.
const hintTimer = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.find((c) => c[1] === 8000)?.[0] as (() => void) | undefined

describe('TabBar coach mark', () => {
  it('shows "Scan papers here too" on Today and counts as seen when the 8 s timer fires', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    render(<TabBar active="today" />)
    expect((await screen.findByRole('status')).textContent).toBe('Scan papers here too')
    expect(await seen()).toBeUndefined()
    const fire = hintTimer(spy)
    expect(fire).toBeTypeOf('function')
    act(() => fire!())
    await waitFor(async () => expect(await seen()).toBe(true))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
  it('Simple mode: no hint and no 8 s timer, so it is never marked seen', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    const spy = vi.spyOn(globalThis, 'setTimeout')
    render(<TabBar active="today" />)
    await screen.findByRole('navigation', { name: 'Main' })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('status')).toBeNull()
    expect(hintTimer(spy)).toBeUndefined()
    expect(await seen()).toBeUndefined()
  })
  it('not on other tabs', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    render(<TabBar active="health" />)
    await screen.findByRole('navigation', { name: 'Main' })
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('status')).toBeNull()
    expect(hintTimer(spy)).toBeUndefined()
  })
})
