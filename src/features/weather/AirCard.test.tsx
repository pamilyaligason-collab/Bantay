import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import AirCard from './AirCard'

const P = { lat: 9.65, lon: 123.85 }
const body = (pm: number | null) => {
  const end = Date.parse(`${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 13)}:00:00Z`)
  return JSON.stringify({ utc_offset_seconds: 28800, hourly: { time: Array.from({ length: 48 }, (_, i) => new Date(end - (47 - i) * 3600_000).toISOString().slice(0, 16)), pm2_5: Array.from({ length: 48 }, () => pm) } })
}
beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('AirCard', () => {
  it('level 3: name, number, caution and the scale label', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body(40))))
    render(<AirCard point={P} />)
    expect(await screen.findByText('Unhealthy for Sensitive Groups')).toBeTruthy()
    expect(screen.getByText('Level 3 of 6')).toBeTruthy()
    expect(screen.getByText(/limit hard activity outdoors/)).toBeTruthy()
    expect(screen.getByText(/Air quality \(DENR scale\), PM2.5 24-hour average/)).toBeTruthy()
  })
  it('S29 W: the words lead; the number is a smaller line labelled fine dust (PM2.5); level 5 is a strong fill with white ink', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body(60))))
    render(<AirCard point={P} />)
    expect(await screen.findByText('Acutely Unhealthy')).toBeTruthy()
    expect(screen.getByText('Fine dust (PM2.5): 60 µg/m³').className).toContain('wx-sub')
    expect((document.querySelector('.wx-aqi-chip') as HTMLElement).style.color).toBe('rgb(255, 255, 255)')
  })
  it('Good has no caution', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body(10))))
    render(<AirCard point={P} />)
    expect(await screen.findByText('Good')).toBeTruthy()
    expect(document.querySelector('.wx-aqi-say')).toBeNull()
  })
  it('no readings: says not available, never Good', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body(null))))
    render(<AirCard point={P} />)
    expect(await screen.findByText('Air quality is not available now.')).toBeTruthy()
    expect(screen.queryByText('Good')).toBeNull()
  })
})
