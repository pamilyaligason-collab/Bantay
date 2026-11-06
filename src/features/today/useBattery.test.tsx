import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readBattery, useBattery } from './useBattery'

const nav = navigator as unknown as { getBattery?: unknown }
function fake(level: number, charging: boolean) {
  const l: Record<string, () => void> = {}
  const m = { level, charging, addEventListener: (t: string, f: () => void) => { l[t] = f }, removeEventListener: (t: string) => { delete l[t] } }
  nav.getBattery = () => Promise.resolve(m)
  return { m, l }
}
afterEach(() => { cleanup(); delete nav.getBattery })

describe('useBattery', () => {
  it('unsupported (no getBattery): null, never a number', async () => {
    const { result } = renderHook(() => useBattery())
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBeNull()
    expect(await readBattery()).toBeNull()
  })
  it('a getBattery that rejects stays null', async () => {
    nav.getBattery = () => Promise.reject(new Error('blocked'))
    const { result } = renderHook(() => useBattery())
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBeNull()
  })
  it('reads the level and follows levelchange and chargingchange', async () => {
    const { m, l } = fake(0.72, false)
    const { result } = renderHook(() => useBattery())
    await waitFor(() => expect(result.current).toEqual({ level: 0.72, charging: false }))
    act(() => { m.level = 0.41; m.charging = true; l.levelchange!() })
    expect(result.current).toEqual({ level: 0.41, charging: true })
    act(() => { m.charging = false; l.chargingchange!() })
    expect(result.current).toEqual({ level: 0.41, charging: false })
  })
  it('a NaN level is unknown (null), not 0', async () => {
    fake(Number.NaN, false)
    expect(await readBattery()).toBeNull()
  })
  it('removes its listeners on unmount', async () => {
    const { l } = fake(0.5, false)
    const { unmount } = renderHook(() => useBattery())
    await waitFor(() => expect(Object.keys(l)).toHaveLength(2))
    unmount()
    expect(Object.keys(l)).toHaveLength(0)
  })
})
