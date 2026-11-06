import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ acting: false, native: false, reduced: false, bat: null as null | { level: number; charging: boolean }, sync: 'web' as string }))
vi.mock('./useBattery', () => ({ useBattery: () => h.bat, readBattery: async () => h.bat }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: null, name: '' }) }))
vi.mock('../look/useReducedMotion', () => ({ useReducedMotion: () => h.reduced }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native } }))
vi.mock('./batteryReminder', async (orig) => ({ ...(await orig<typeof import('./batteryReminder')>()), syncBatteryReminder: async () => h.sync }))
import BatteryCard from './BatteryCard'

const clock = (hh: number) => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 6, hh) })
beforeEach(() => { h.acting = false; h.native = false; h.reduced = false; h.bat = null; h.sync = 'web' })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('BatteryCard', () => {
  it('unsupported: nothing is rendered', () => {
    const { container } = render(<BatteryCard />)
    expect(container.firstChild).toBeNull()
  })
  it('ok: 72 % battery, Enough for tonight, not low', () => {
    clock(10); h.bat = { level: 0.72, charging: false }
    render(<BatteryCard />)
    expect(screen.getByText('72% battery')).toBeTruthy()
    expect(screen.getByText(/Enough for tonight/)).toBeTruthy()
    expect(screen.getByTestId('battery-card').getAttribute('data-low')).toBeNull()
  })
  it('charging: says Charging, pulse on, and off under reduced motion', () => {
    clock(10); h.bat = { level: 0.41, charging: true }
    const { container, rerender } = render(<BatteryCard />)
    expect(screen.getByText('Charging')).toBeTruthy()
    expect(container.querySelector('.bat-fill')!.hasAttribute('data-charging')).toBe(true)
    h.reduced = true
    rerender(<BatteryCard />)
    expect(container.querySelector('.bat-fill')!.hasAttribute('data-charging')).toBe(false)
  })
  it('low before 7 PM on the web: amber, Charge before night, no promise of a reminder', () => {
    clock(10); h.bat = { level: 0.24, charging: false }
    render(<BatteryCard />)
    expect(screen.getByTestId('battery-card').hasAttribute('data-low')).toBe(true)
    expect(screen.getByText('Charge before night.')).toBeTruthy()
    expect(screen.queryByText(/Reminds you based/)).toBeNull()
  })
  it('low before 7 PM on a phone with the reminder scheduled: says Reminder set for 7 PM and the footnote', async () => {
    clock(10); h.bat = { level: 0.24, charging: false }; h.native = true; h.sync = 'scheduled'
    render(<BatteryCard />)
    await waitFor(() => expect(screen.getByText('Charge before night. Reminder set for 7 PM.')).toBeTruthy())
    expect(screen.getByText('Reminds you based on the level when Bantay was last open.')).toBeTruthy()
  })
  it('low on a phone but permission refused: no Reminder set claim', async () => {
    clock(10); h.bat = { level: 0.24, charging: false }; h.native = true; h.sync = 'no-permission'
    render(<BatteryCard />)
    await Promise.resolve()
    expect(screen.getByText('Charge before night.')).toBeTruthy()
  })
  it('low after 7 PM: words say not charging', () => {
    clock(20); h.bat = { level: 0.24, charging: false }
    render(<BatteryCard />)
    expect(screen.getByText(/Not charging/)).toBeTruthy()
  })
  it('hidden while an admin views as someone else', () => {
    h.bat = { level: 0.5, charging: false }; h.acting = true
    const { container } = render(<BatteryCard />)
    expect(container.firstChild).toBeNull()
  })
})
