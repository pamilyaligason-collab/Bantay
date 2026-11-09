import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const box = (a: number) => [[[[a, a], [a + 10, a], [a + 10, a + 10], [a, a + 10], [a, a]]]]
const h = vi.hoisted(() => ({ loc: { lat: 5, lon: 5 } as { lat: number | null; lon: number | null }, kv: null as unknown, set: vi.fn(), gate: null as Promise<void> | null }))
vi.mock('../location/useLocation', () => ({ useLocation: () => h.loc }))
vi.mock('../safety/unitAt', async (orig) => ({
  ...(await orig<typeof import('../safety/unitAt')>()),
  loadUnits: async () => {
    await h.gate
    return [
      { code: 'A', name: 'Abra', bbox: [0, 0, 10, 10], polys: box(0) }, // sure, type 1
      { code: 'B', name: 'Albay', bbox: [20, 20, 30, 30], polys: box(20) } // uncertain, type 4 (PAGASA map 2026-11-09)
    ]
  }
}))
vi.mock('../shell/useKv', () => ({ useKv: () => { const [v, set] = useState(h.kv); return [v, (x: unknown) => { h.set(x); set(x) }, true] } }))
import { asPick, manilaMonth, MONTH_NAMES, resolveClimate, useClimate, useMonth } from './climate'

function Probe() {
  const c = useClimate()
  const m = useMonth()
  return <div><p data-testid="p">{String(c.type)}|{String(c.guess)}|{String(c.ready)}|{MONTH_NAMES[m - 1]}</p><button onClick={() => c.pick(4)}>pick</button></div>
}
const text = () => screen.getByTestId('p').textContent!
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
// Manila is UTC+8: 15:58 UTC on 31 Oct is 23:58 in Manila, whatever zone the test machine is in
const OCT31 = Date.UTC(2026, 9, 31, 15, 58, 0)

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(OCT31); h.loc = { lat: 5, lon: 5 }; h.kv = null; h.gate = null; h.set.mockClear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('stored pick is validated', () => {
  it('keeps a whole 1-4 or a well-formed object; everything else is no pick', () => {
    expect(asPick(3)).toEqual({ type: 3, province: null })
    expect(asPick({ type: 2, province: 'Abra' })).toEqual({ type: 2, province: 'Abra' })
    expect(asPick({ type: 2, province: 7 })).toEqual({ type: 2, province: null })
    for (const bad of [7, 0, NaN, 2.5, '3', {}, { type: 9 }, { type: '3' }, { province: 'Abra' }, [], true, undefined, null]) expect(asPick(bad), String(bad)).toBeNull()
    expect(resolveClimate(null, 7, null).type).toBeNull()
    expect(resolveClimate({ type: 4, uncertain: false }, { type: 0 }, 'A').type).toBe(4)
  })
  it('manilaMonth reads the Philippine month', () => {
    expect(manilaMonth(new Date(OCT31))).toBe(10)
    expect(manilaMonth(new Date(OCT31 + 2 * 60_000))).toBe(11)
  })
})

describe('useClimate', () => {
  it('ready waits for the province lookup, then an uncertain province is used automatically', async () => {
    let open!: () => void
    h.gate = new Promise<void>((r) => { open = r })
    h.loc = { lat: 25, lon: 25 }
    render(<Probe />); await flush()
    expect(text()).toBe('null|false|false|October')
    open(); await flush()
    expect(text()).toBe('4|true|true|October')
  })
  it('re-resolves when the place moves, with no remount', async () => {
    const { rerender } = render(<Probe />); await flush()
    expect(text()).toBe('1|false|true|October')
    h.loc = { lat: 25, lon: 25 }
    rerender(<Probe />); await flush()
    expect(text()).toBe('4|true|true|October')
  })
  it('a pick is saved as {type, province}; it holds there, is ignored elsewhere, and counts where no province answers', async () => {
    render(<Probe />); await flush()
    fireEvent.click(screen.getByText('pick'))
    expect(h.set).toHaveBeenCalledWith({ type: 4, province: 'Abra' })
    expect(text()).toBe('4|false|true|October')
    cleanup(); h.kv = { type: 3, province: 'Abra' }
    render(<Probe />); await flush()
    expect(text()).toBe('3|false|true|October')
    cleanup(); h.loc = { lat: 25, lon: 25 }; render(<Probe />); await flush()
    expect(text()).toBe('4|true|true|October')
    cleanup(); h.loc = { lat: 60, lon: 60 }; render(<Probe />); await flush()
    expect(text()).toBe('3|false|true|October')
  })
  it('a legacy bare number is ignored once a province resolves, and honoured when none does', async () => {
    h.kv = 3
    render(<Probe />); await flush()
    expect(text()).toBe('1|false|true|October')
    cleanup(); h.loc = { lat: 60, lon: 60 }; render(<Probe />); await flush()
    expect(text()).toBe('3|false|true|October')
  })
  it('garbage in kv is no pick', async () => {
    h.kv = 7; h.loc = { lat: 60, lon: 60 }
    render(<Probe />); await flush()
    expect(text()).toBe('null|false|true|October')
  })
})

describe('useMonth', () => {
  it('rolls over on the 60 s tick (Oct 31 23:58 to Nov 1 00:00 Manila)', async () => {
    render(<Probe />); await flush()
    expect(text()).toContain('October')
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(text()).toContain('October') // 23:59
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(text()).toContain('November')
  })
  it('is re-read when the app becomes visible again, before any tick', async () => {
    render(<Probe />); await flush()
    vi.setSystemTime(Date.UTC(2026, 10, 1, 1, 0, 0))
    expect(text()).toContain('October')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(text()).toContain('November')
  })
  it('stops its tick and listener on unmount', async () => {
    const off = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Probe />); await flush()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(off).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
