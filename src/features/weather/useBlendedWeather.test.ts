import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Blended } from '../../../supabase/functions/weather-blend/blend.ts'
import { db } from '../../db'
import { openMeteoFixture } from './fixture'
import { forecastKey, readCached } from './forecast'
import { loadBlended, useBlendedWeather, WEATHER_BLEND_ON } from './useBlendedWeather'

const P = { lat: 9.645705, lon: 123.877951 }
const NOW = { time: '2026-10-31T13:07', temp: 30.5, humidity: 75, feels: 37, code: 2, wind: 9, gust: 18, uv: 9 }
const BLEND: Blended & { ok: true } = {
  ok: true, cell: { lat: 9.65, lon: 123.88 }, fetchedAt: new Date().toISOString(), tz: 'Asia/Manila', utcOffset: 28800, now: NOW,
  next2h: [{ time: '2026-10-31T13:00', mmh: 0, estimated: false }], hourly48: [{ time: '2026-10-31T13:00', temp: 30, prob: 20, code: 2, rain: 0 }],
  daily10: [{ date: '2026-10-31', code: 61, min: 25, max: 32, prob: 70, uvMax: 9, sunrise: '2026-10-31T05:45', sunset: '2026-10-31T17:30' }],
  aqi: { index: 2, label: 'Fair', pm25: 12, pm10: 20 }, alerts: [], check: null,
  sources: [{ id: 'open-meteo', ok: true, credit: 'Weather data by Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' }]
}
const BLEND_FC = () => ({ fetchedAt: '', tz: 'Asia/Manila', utcOffset: 28800, current: { ...NOW, temp: 29 }, hourly: [], daily: [] })
const good = vi.fn(async () => BLEND)
const down = vi.fn(async () => { throw new Error('FunctionsFetchError') })
const direct = vi.fn(async () => new Response(JSON.stringify(openMeteoFixture()), { status: 200 }))

beforeEach(async () => { await db.kv.clear(); vi.clearAllMocks(); vi.stubGlobal('fetch', direct) })
afterEach(() => { vi.unstubAllGlobals() })

describe('useBlendedWeather', () => {
  it('is off by default', () => expect(WEATHER_BLEND_ON).toBe(false))

  it('off: the direct Open-Meteo forecast, the function is never called', async () => {
    const { result } = renderHook(() => useBlendedWeather(P, { invoke: good }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ blended: false, next2h: [], aqi: null })
    expect(result.current.fc).not.toBeNull()
    expect(good).not.toHaveBeenCalled()
    expect(direct).toHaveBeenCalledTimes(1)
  })

  it('on: the blend, sent as the 1 km cell, saved as the offline forecast; no direct call', async () => {
    const { result } = renderHook(() => useBlendedWeather(P, { on: true, invoke: good }))
    await waitFor(() => expect(result.current.blended).toBe(true))
    expect(good).toHaveBeenCalledWith({ lat: 9.65, lon: 123.88 })
    expect(result.current.fc?.current.temp).toBe(30.5)
    expect(result.current).toMatchObject({ aqi: { label: 'Fair' }, next2h: [{ estimated: false }], offline: false, loading: false })
    expect(direct).not.toHaveBeenCalled()
    await waitFor(async () => expect((await readCached(P))?.current.temp).toBe(30.5))
    expect((await db.kv.get(forecastKey(P)))?.key).toBe(forecastKey(P))
  })

  it('on but the function fails: falls back to the direct forecast', async () => {
    const { result } = renderHook(() => useBlendedWeather(P, { on: true, invoke: down }))
    await waitFor(() => expect(result.current.fc).not.toBeNull())
    expect(result.current.blended).toBe(false)
    expect(direct).toHaveBeenCalledTimes(1)
  })

  it('a stale answer (every provider down) shows as offline and is not saved over the offline forecast', async () => {
    const stale = vi.fn(async () => ({ ...BLEND, stale: true }))
    const { result } = renderHook(() => useBlendedWeather(P, { on: true, invoke: stale }))
    await waitFor(() => expect(result.current.blended).toBe(true))
    expect(result.current.offline).toBe(true)
    expect(await readCached(P)).toBeNull()
  })

  it('pending: the cached forecast for this place first; a new place never shows the old one', async () => {
    await db.kv.put({ key: forecastKey(P), value: { ...BLEND_FC(), fetchedAt: new Date().toISOString() } })
    let release = () => {}
    const slow = vi.fn(() => new Promise<unknown>((r) => { release = () => r(BLEND) }))
    const Q = { lat: 6.11, lon: 125.17 }
    const { result, rerender } = renderHook(({ at }) => useBlendedWeather(at, { on: true, invoke: slow }), { initialProps: { at: P } })
    await waitFor(() => expect(result.current.fc?.current.temp).toBe(29))
    expect(result.current).toMatchObject({ loading: true, blended: false })
    rerender({ at: Q })
    expect(result.current.fc).toBeNull()
    release()
    await waitFor(() => expect(result.current.blended).toBe(true))
  })
})

describe('loadBlended', () => {
  it('offline: throws before calling the function', async () => {
    const on = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(loadBlended(P, good)).rejects.toThrow('offline')
    expect(good).not.toHaveBeenCalled()
    on.mockRestore()
  })
  it('a finished run never clears the entry of a newer run for the same place', async () => {
    let doneA!: (v: unknown) => void
    const a = vi.fn(() => new Promise((r) => { doneA = r }))
    const b = vi.fn(() => new Promise(() => {})) // never answers: its entry must stay
    const pa = loadBlended(P, a)
    void loadBlended(P, b) // a different invoke replaces the entry
    doneA(BLEND)
    await pa
    void loadBlended(P, b)
    expect(b).toHaveBeenCalledTimes(1) // still shared, not asked again
  })
  it('an error answer (not ok, or not family) is a failure', async () => {
    await expect(loadBlended(P, async () => ({ ok: false, error: 'not_family' }))).rejects.toThrow('bad_blend')
  })

  it('a blend older than a day is refused, so the screen falls back', async () => {
    const old = vi.fn(async () => ({ ...BLEND, fetchedAt: new Date(Date.now() - 25 * 3600_000).toISOString() }))
    await expect(loadBlended(P, old)).rejects.toThrow('too_old')
  })

  it('stays fresh: when the network returns after 10 minutes it asks again, and a failed refresh keeps the numbers but says stale', async () => {
    const flaky = vi.fn().mockResolvedValueOnce(BLEND).mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useBlendedWeather(P, { on: true, invoke: flaky }))
    await waitFor(() => expect(result.current.blended).toBe(true))
    expect(result.current.offline).toBe(false)
    const real = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(real + 11 * 60_000)
    try {
      window.dispatchEvent(new Event('online'))
      await waitFor(() => expect(flaky).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(result.current).toMatchObject({ blended: true, offline: true }))
    } finally { vi.useRealTimers() }
  })
})
