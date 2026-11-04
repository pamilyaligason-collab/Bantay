import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { openMeteoFixture } from './fixture'
import { useForecast } from './forecast'

const DAMPAS = { lat: 9.65, lon: 123.88 }
const CONEL = { lat: 6.2, lon: 125.19 }

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('useForecast', () => {
  it('after the place changes it never returns the old place forecast while the new one loads', async () => {
    let release: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((u: string) => (String(u).includes('latitude=6.2&')
      ? new Promise<Response>((res) => { release = res })
      : Promise.resolve(new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 30, humidity: 50 })), { status: 200 })))))
    const seen: string[] = [] // every render: which place was asked for and which temperature came back
    const { result, rerender } = renderHook(({ p }) => { const r = useForecast(p); seen.push(`${p.lat}:${r.fc?.current.temp ?? '-'}`); return r }, { initialProps: { p: DAMPAS } })
    await waitFor(() => expect(result.current.fc).not.toBeNull())
    rerender({ p: CONEL })
    expect(seen.filter((x) => x.startsWith('6.2:'))).not.toContain('6.2:30') // no render for Conel ever shows Dampas weather
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes('latitude=6.2&'))).toBe(true))
    await act(async () => { release(new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 28, humidity: 50 })), { status: 200 })) })
    await waitFor(() => expect(result.current.fc?.current.temp).toBe(28))
  })
})
