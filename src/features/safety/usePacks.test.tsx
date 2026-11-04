import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Unit } from './unitAt'

const h = vi.hoisted(() => ({ on: true, units: [] as Unit[], gate: null as Promise<Unit[]> | null }))
vi.mock('./flags', () => ({ FLAGS: { get localPacks() { return h.on } } }))
vi.mock('./unitAt', async (orig) => ({ ...(await orig<typeof import('./unitAt')>()), loadUnits: () => h.gate ?? Promise.resolve(h.units) }))
vi.mock('./packs', () => ({ loadPack: async () => null, syncPacks: async () => ({ fetched: [], bad: [], offline: true }), cleanup: async () => [] }))
import { tracker, useUnit, useUnitInfo } from './usePacks'

const sq = (a: number, b: number, c: number, d: number) => [[a, c], [b, c], [b, d], [a, d], [a, c]] // lon a..b, lat c..d
const near = (lat: number, lon: number) => ({ source: 'gps', zone: 'dampas', weather: { lat, lon } })
beforeEach(() => { h.on = true; h.units = []; h.gate = null; tracker.cur = null; tracker.cand = null })

describe('useUnitInfo: proven only for a picked zone, or an outline that puts THIS position in THIS unit', () => {
  const zone = { source: 'zone', zone: 'dampas', weather: { lat: 9.64, lon: 123.87 } }
  const U9: Unit = { code: 'U9', name: 'Invented', bbox: [10, 10, 11, 11], polys: [[sq(10, 11, 10, 11)]] }
  it('a picked zone is proven', async () => {
    const { result } = renderHook(() => useUnitInfo(zone))
    await waitFor(() => expect(result.current).toEqual({ unit: '0701200000', proven: true }))
  })
  it('no outlines file: a GPS place in the home circle has the unit but is not proven', async () => {
    const { result } = renderHook(() => useUnitInfo(near(9.64, 123.87)))
    await waitFor(() => expect(result.current.unit).toBe('0701200000'))
    expect(result.current.proven).toBe(false)
  })
  it('zone to GPS while loadUnits is still pending: proven drops at once, never carried over from the zone', async () => {
    let release!: (u: Unit[]) => void
    const { result, rerender } = renderHook(({ p }) => useUnitInfo(p), { initialProps: { p: zone as ReturnType<typeof near> } })
    await waitFor(() => expect(result.current.proven).toBe(true))
    h.gate = new Promise<Unit[]>((r) => { release = r })
    rerender({ p: near(9.65, 123.88) })
    await waitFor(() => expect(result.current.proven).toBe(false)) // pending, not carried over
    release([])
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.proven).toBe(false)
  })
  it('a fix in no outline keeps the old unit through the hysteresis but is not proven', async () => {
    h.units = [U9]
    const a = renderHook(() => useUnitInfo(near(10.5, 10.5)))
    await waitFor(() => expect(a.result.current).toEqual({ unit: 'U9', proven: true }))
    const b = renderHook(() => useUnitInfo(near(50, 50))) // outside every outline: tracker returns the old unit
    await waitFor(() => expect(b.result.current.unit).toBe('U9'))
    expect(b.result.current.proven).toBe(false)
  })
  it('a pending switch to the next unit keeps the old unit for 2 minutes and is not proven', async () => {
    const U8: Unit = { code: 'U8', name: 'Next', bbox: [20, 20, 21, 21], polys: [[sq(20, 21, 20, 21)]] }
    h.units = [U9, U8]
    const a = renderHook(() => useUnitInfo(near(10.5, 10.5)))
    await waitFor(() => expect(a.result.current.unit).toBe('U9'))
    const b = renderHook(() => useUnitInfo(near(20.5, 20.5)))
    await waitFor(() => expect(b.result.current.unit).toBe('U9')) // hysteresis still holds the old one
    expect(b.result.current.proven).toBe(false)
  })
  it('loadUnits that never answers times out and leaves the place unproven', async () => {
    vi.useFakeTimers()
    try {
      h.gate = new Promise<Unit[]>(() => undefined)
      const { result } = renderHook(() => useUnitInfo(near(9.64, 123.87)))
      await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
      expect(result.current.proven).toBe(false)
      expect(result.current.unit).toBe('0701200000') // the home circle fallback still answers
    } finally { vi.useRealTimers() }
  })
})

describe('useUnit', () => {
  it('flag off: no unit', async () => {
    h.on = false
    const { result } = renderHook(() => useUnit({ source: 'zone', zone: 'dampas', weather: { lat: 9.64, lon: 123.87 } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current).toBeNull()
  })
  it('a picked home zone is its own unit', async () => {
    const { result } = renderHook(() => useUnit({ source: 'zone', zone: 'conel', weather: { lat: 6.2, lon: 125.18 } }))
    await waitFor(() => expect(result.current).toBe('1230800000'))
  })
  it('GPS with an outlines file: the unit that holds the point', async () => {
    h.units = [{ code: 'U9', name: 'Invented', bbox: [10, 10, 11, 11], polys: [[sq(10, 11, 10, 11)]] }]
    const { result } = renderHook(() => useUnit(near(10.5, 10.5)))
    await waitFor(() => expect(result.current).toBe('U9'))
  })
  it('GPS with no outlines file: inside a home area gives the home unit, elsewhere none', async () => {
    const a = renderHook(() => useUnit(near(9.64, 123.87)))
    await waitFor(() => expect(a.result.current).toBe('0701200000'))
    tracker.cur = null // a fix in no unit keeps the last one, so start clean
    const b = renderHook(() => useUnit({ source: 'gps', zone: 'dampas', weather: { lat: 14.5, lon: 121 } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(b.result.current).toBeNull()
  })
})
