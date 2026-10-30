import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const plug = vi.hoisted(() => ({
  isAvailable: vi.fn(async () => ({ available: true, platform: 'android' as const })),
  requestAuthorization: vi.fn(async (_o: { read: string[] }) => ({ readAuthorized: [] as string[], readDenied: [] as string[] })),
  checkAuthorization: vi.fn(async (_o: { read: string[] }) => ({ readAuthorized: [] as string[], readDenied: [] as string[] })),
  openHealthConnectSettings: vi.fn(async () => {})
}))
vi.mock('@capgo/capacitor-health', () => ({ Health: plug }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true } }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u', personId: 'p', role: 'member', handle: null }), getAccessToken: async () => null }))

import { capgoBridge } from './bridge'
import SensorSettings from './SensorSettings'

const ALL = ['steps', 'sleep', 'heartRate', 'bloodPressure']
beforeEach(async () => {
  await db.kv.clear()
  vi.clearAllMocks()
  plug.isAvailable.mockResolvedValue({ available: true, platform: 'android' })
  plug.requestAuthorization.mockResolvedValue({ readAuthorized: [], readDenied: [] })
  plug.checkAuthorization.mockResolvedValue({ readAuthorized: [], readDenied: [] })
})
afterEach(cleanup)

describe('capgoBridge', () => {
  it('an empty request list falls back to the quiet check, which says what was really granted', async () => {
    plug.checkAuthorization.mockResolvedValue({ readAuthorized: ['steps', 'sleep'], readDenied: [] })
    expect(await capgoBridge().requestAll!(ALL as never)).toEqual(['steps', 'sleep'])
  })
  it('keeps the raw error of a failed request for the check row, and rethrows', async () => {
    plug.requestAuthorization.mockRejectedValue(Object.assign(new Error('permission launcher failed'), { code: 'E_LAUNCH' }))
    const b = capgoBridge()
    await expect(b.requestAll!(ALL as never)).rejects.toThrow('permission launcher failed')
    const d = await b.diagnose!()
    expect(d.lastRequest).toContain('code=E_LAUNCH')
    expect(d.lastRequest).toContain('permission launcher failed')
  })
  it('diagnose reports availability, reason and the granted list', async () => {
    plug.isAvailable.mockResolvedValue({ available: false, platform: 'android', reason: 'NOT_INSTALLED' } as never)
    plug.checkAuthorization.mockResolvedValue({ readAuthorized: ['steps'], readDenied: [] })
    const d = await capgoBridge().diagnose!()
    expect(d).toMatchObject({ available: false, granted: ['steps'], platform: 'android' })
    expect(d.reason).toContain('NOT_INSTALLED')
  })
  it('N-1: a Health Connect that never answers ends the check with a visible reason, not a hang', async () => {
    vi.useFakeTimers()
    try {
      plug.isAvailable.mockReturnValue(new Promise(() => {}) as never)
      plug.checkAuthorization.mockReturnValue(new Promise(() => {}) as never)
      const p = capgoBridge().diagnose!()
      await vi.advanceTimersByTimeAsync(25_000)
      const d = await p
      expect(d.available).toBeNull()
      expect(d.reason).toContain('did not answer')
      expect(d.lastCheck).toContain('did not answer')
    } finally { vi.useRealTimers() }
  })
  it('N-1: a tap on a switch whose Health Connect never answers says it is not available, with the reason', async () => {
    vi.useFakeTimers()
    try {
      plug.isAvailable.mockReturnValue(new Promise(() => {}) as never)
      const { enableTypes } = await import('./health')
      const p = enableTypes(['steps'] as never, capgoBridge())
      await vi.advanceTimersByTimeAsync(15_000)
      expect(await p).toMatchObject({ result: 'unavailable', error: expect.stringContaining('did not answer') })
    } finally { vi.useRealTimers() }
  })
})

describe('SensorSettings result line and check row', () => {
  const turnOn = () => fireEvent.click(screen.getByRole('button', { name: 'Turn on all' }))
  it('granted 4 of 4', async () => {
    plug.requestAuthorization.mockResolvedValue({ readAuthorized: ALL, readDenied: [] })
    render(<SensorSettings native bridge={capgoBridge()} />)
    turnOn()
    expect(await screen.findByText('Allowed 4 of 4.')).toBeTruthy()
  })
  it('empty list from the plugin but granted per the check still ends with a result', async () => {
    plug.checkAuthorization.mockResolvedValue({ readAuthorized: ['steps', 'sleep', 'heartRate'], readDenied: [] })
    render(<SensorSettings native bridge={capgoBridge()} />)
    turnOn()
    expect(await screen.findByText('Allowed 3 of 4.')).toBeTruthy()
  })
  it('declined shows a line', async () => {
    render(<SensorSettings native bridge={capgoBridge()} />)
    turnOn()
    expect(await screen.findByText('Declined: 0 of 4 allowed.')).toBeTruthy()
  })
  it('an error shows its text', async () => {
    plug.requestAuthorization.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<SensorSettings native bridge={capgoBridge()} />)
    turnOn()
    expect(await screen.findByText(/Error: boom/)).toBeTruthy()
  })
  it('unavailable shows the reason', async () => {
    plug.isAvailable.mockResolvedValue({ available: false, platform: 'android', reason: 'NOT_INSTALLED' } as never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<SensorSettings native bridge={capgoBridge()} />)
    turnOn()
    expect(await screen.findByText(/Health Connect is not available/)).toBeTruthy()
  })
  it('the check row shows raw values, opens Health Connect and copies the details', async () => {
    plug.checkAuthorization.mockResolvedValue({ readAuthorized: ['steps'], readDenied: [] })
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    render(<SensorSettings native bridge={capgoBridge()} />)
    const row = screen.getByText('Health Connect check').closest('details')!
    row.open = true
    fireEvent(row, new Event('toggle'))
    expect(await screen.findByText(/Android version:/)).toBeTruthy()
    expect(screen.getByText(/Allowed now: steps/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith(expect.stringContaining('"granted"')))
    fireEvent.click(screen.getByRole('button', { name: 'Open Health Connect' }))
    await waitFor(() => expect(plug.openHealthConnectSettings).toHaveBeenCalled())
  })
})
