// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FxSaved } from './FxCard'
const h = vi.hoisted(() => ({ saved: undefined as unknown, loaded: true, set: vi.fn() }))
vi.mock('../shell/useKv', () => ({
  useKv: () => {
    const [v, setV] = useState<unknown>(h.saved)
    return [v, (x: unknown) => { h.set(x); setV(x) }, h.loaded]
  }
}))
const tr = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../admin/events', () => ({ track: tr }))
import FxCard, { fetchPhp, nextSaved } from './FxCard'

const NOON = new Date(2026, 10, 9, 12, 0, 0).getTime() // Mon 9 Nov 2026, local noon
const at = (d: number, hh: number, mm = 0) => new Date(2026, 10, d, hh, mm).getTime()
const ok = (php: number) => vi.fn(async () => ({ ok: true, json: async () => ({ result: 'success', rates: { PHP: php } }) }) as Response)
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOON); h.saved = undefined; h.loaded = true; h.set.mockClear(); tr.mockClear() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
const stub = (f: ReturnType<typeof vi.fn>) => { fetchMock = f; vi.stubGlobal('fetch', f) }

describe('FxCard', () => {
  it('first run: one GET to open.er-api.com, shows PHP per USD to 2 decimals, the BSP line and the credit; no change line yet', async () => {
    stub(ok(63.1))
    render(<FxCard />)
    expect(await screen.findByText('₱63.10')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://open.er-api.com/v6/latest/USD')
    expect(screen.getByText('Market rate, not the BSP reference rate.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Rates by exchangerate-api.com' }).getAttribute('href')).toBe('https://www.exchangerate-api.com')
    expect(screen.queryByTestId('fx-change')).toBeNull()
    expect(screen.queryByText(/Offline/)).toBeNull()
    expect(h.set).toHaveBeenCalledWith({ php: 63.1, at: NOON, prev: null, prevAt: null })
    await waitFor(() => expect(tr).toHaveBeenCalledWith('action', 'card_fx'))
  })
  it('a new day compares with the saved value: up 0.08 since yesterday', async () => {
    h.saved = { php: 63.02, at: at(8, 8, 2), prev: null, prevAt: null } satisfies FxSaved
    stub(ok(63.1))
    render(<FxCard />)
    await waitFor(() => expect(screen.getByTestId('fx-change').textContent).toBe('▲ Up ₱0.08 since yesterday'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('down, and no change', async () => {
    h.saved = { php: 63.5, at: at(7, 9), prev: null, prevAt: null }
    stub(ok(63.25))
    render(<FxCard />)
    await waitFor(() => expect(screen.getByTestId('fx-change').textContent).toBe('▼ Down ₱0.25 since Sat 7 Nov'))
    cleanup()
    h.saved = { php: 63.1, at: at(8, 9), prev: null, prevAt: null }
    stub(ok(63.1))
    render(<FxCard />)
    await waitFor(() => expect(screen.getByTestId('fx-change').textContent).toBe('No change since yesterday'))
  })
  it('already read today: no GET at all, no offline chip', () => {
    h.saved = { php: 63.1, at: at(9, 8, 2), prev: 63.02, prevAt: at(8, 8, 2) }
    stub(ok(70))
    render(<FxCard />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('₱63.10')).toBeTruthy()
    expect(screen.queryByText(/Offline/)).toBeNull()
  })
  it('offline with an older saved rate: shows it with the "Offline · rate from <time>" chip', async () => {
    h.saved = { php: 63.1, at: at(8, 8, 2), prev: null, prevAt: null }
    stub(vi.fn(async () => { throw new TypeError('network') }))
    render(<FxCard />)
    expect((await screen.findByRole('status')).textContent).toBe('Offline · rate from 8:02 AM')
    expect(screen.getByText('₱63.10')).toBeTruthy()
    expect(h.set).not.toHaveBeenCalled()
  })
  it('hidden when nothing was ever fetched (offline, a bad status, or a bad body)', async () => {
    for (const f of [vi.fn(async () => { throw new TypeError('network') }), vi.fn(async () => ({ ok: false }) as Response), vi.fn(async () => ({ ok: true, json: async () => ({ result: 'error' }) }) as Response), ok(0)]) {
      stub(f)
      const { container } = render(<FxCard />)
      await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
      await Promise.resolve()
      expect(container.innerHTML).toBe('')
      cleanup()
    }
    expect(tr).not.toHaveBeenCalled()
  })
  it('waits for the saved value to load before it fetches', () => {
    h.loaded = false
    stub(ok(63.1))
    render(<FxCard />)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('nextSaved moves the old value to prev', () => {
    expect(nextSaved({ php: 1, at: 5, prev: null, prevAt: null }, 2, 9)).toEqual({ php: 2, at: 9, prev: 1, prevAt: 5 })
  })
  it('an old WebView without AbortSignal.timeout still fetches, with no signal', async () => {
    vi.stubGlobal('AbortSignal', class {}) // no static timeout, as before Chrome 103
    stub(ok(63.1))
    expect(await fetchPhp()).toBe(63.1)
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeUndefined()
  })
})
