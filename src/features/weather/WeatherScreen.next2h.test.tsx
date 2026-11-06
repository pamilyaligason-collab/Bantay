import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { openMeteoFixture } from './fixture'
import { RAIN_KEY } from './rainRemind'
import WeatherScreen from './WeatherScreen'

const cap = vi.hoisted(() => ({ native: false }))
const LN = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), checkPermissions: vi.fn(), requestPermissions: vi.fn() }))
vi.mock('@capacitor/core', async (orig) => ({ ...(await orig<typeof import('@capacitor/core')>()), Capacitor: { isNativePlatform: () => cap.native, isPluginAvailable: () => false, getPlatform: () => (cap.native ? 'android' : 'web') } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../auth/client', () => ({ supabase: null }))

// a made-up answer that carries real hourly millimetres: steady rain, 3 mm an hour
const withMm = () => { const f = openMeteoFixture({ now: new Date(), temp: 31, humidity: 70 }); return { ...f, hourly: { ...f.hourly, precipitation: f.hourly.time.map(() => 3) } } }

beforeEach(async () => {
  cap.native = false
  vi.clearAllMocks()
  LN.schedule.mockResolvedValue(undefined); LN.cancel.mockResolvedValue(undefined)
  LN.checkPermissions.mockResolvedValue({ display: 'denied' }); LN.requestPermissions.mockResolvedValue({ display: 'granted' })
  await db.kv.clear(); localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(withMm()), { status: 200 })))
  location.hash = '#weather'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Weather screen: Next 2 hours with the blend flag off (X3)', () => {
  it('shows the 15-minute block from the real hourly millimetres, labelled estimated, and no reminder switch on the web', async () => {
    render(<WeatherScreen />)
    const block = await screen.findByTestId('wx-next2h-est')
    expect(block.textContent).toContain('estimated')
    expect(block.textContent).toContain('Next 2 hours: rain now') // 3 mm an hour falling
    expect(block.textContent).toContain('Estimated from hourly data')
    expect(block.querySelectorAll('.td-rm-bars li').length).toBe(8) // 8 bars of 15 minutes
    expect(screen.queryByTestId('wx-remind')).toBeNull()
  })
  it('on a phone the switch shows; turning it on asks for the notification permission and saves the choice', async () => {
    cap.native = true
    render(<WeatherScreen />)
    const sw = await screen.findByTestId('wx-remind')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    await waitFor(() => expect(LN.requestPermissions).toHaveBeenCalledTimes(1))
    await waitFor(async () => expect((await db.kv.get(RAIN_KEY))?.value).toBe(true))
    await waitFor(() => expect(screen.getByTestId('wx-remind').getAttribute('aria-checked')).toBe('true'))
  })
})
