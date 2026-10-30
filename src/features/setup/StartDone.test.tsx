import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'

const h = vi.hoisted(() => ({
  consent: vi.fn(async () => true), track: vi.fn(async () => true), display: false, turnOn: vi.fn(async () => undefined),
  openSettings: vi.fn(async () => true), person: 'p-mama' as string | null, gps: vi.fn()
}))
vi.mock('../auth/client', () => ({ supabase: {} }))
vi.mock('../auth/session', () => ({ getMember: vi.fn(async () => ({ userId: 'u1', personId: 'p-mama', role: 'member', handle: 'mama' })) }))
vi.mock('../admin/events', () => ({ track: h.track }))
vi.mock('./consent', async (orig) => ({ ...(await orig<object>()), recordConsent: h.consent, flushConsent: vi.fn() }))
vi.mock('../sensors/health', () => ({ currentPersonId: async () => h.person }))
vi.mock('../location/useLocation', async (orig) => ({ ...(await orig<object>()), resolveLocation: h.gps }))
vi.mock('./steps', async (orig) => ({
  ...(await orig<object>()),
  notifyState: async () => ({ display: h.display, exact: true, battery: true }),
  turnOnReminders: h.turnOn,
  openAppSettings: h.openSettings
}))
vi.mock('../phonecheck/probe', () => ({ scheduleTestAlarm: vi.fn(async () => 'scheduled') }))
import StartDone from './StartDone'

const kv = async (k: string) => (await db.kv.get(k))?.value
const dots = (n: number) => screen.getByRole('img', { name: `Step ${n} of 5` })

beforeEach(async () => {
  await db.kv.clear(); await ldb.medications.clear()
  h.consent.mockClear(); h.track.mockClear(); h.turnOn.mockReset(); h.openSettings.mockClear(); h.gps.mockReset()
  h.display = false; h.person = 'p-mama'
  localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p-mama', displayName: 'Mama Rosa', handle: 'mama', provider: 'pin' }]))
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('onboarding screens 3 to 5 (StartDone)', () => {
  it('screen 3 asks for reminders in context: dots only, Skip, no medicines on file', async () => {
    render(<StartDone onDone={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Medicine reminders' })).toBeTruthy()
    expect(screen.getByText('Bantay rings at each dose, even with the screen off.')).toBeTruthy()
    expect(dots(3)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on reminders' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(await screen.findByText('No medicines yet. Your carer can add them.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Step \d of \d|then Today|Bigger text|Simple mode|admin/i)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('lists the doses on file with their times', async () => {
    await ldb.medications.add({ personId: 'p-mama', name: 'Losartan', strength: '50 mg', schedule: { v: 1, times: ['09:00'] } })
    await ldb.medications.add({ personId: 'p-mama', name: 'Old one', schedule: { v: 1, times: ['07:00'] }, medStatus: 'stopped' })
    render(<StartDone onDone={() => undefined} />)
    expect(await screen.findByText('Losartan 50 mg · 9:00 AM')).toBeTruthy()
    expect(screen.queryByText(/Old one/)).toBeNull()
    expect(screen.getByText('Not right? Fix later in Health.')).toBeTruthy()
  })

  it('Turn on reminders moves to screen 4 once the switch is on', async () => {
    h.turnOn.mockImplementation(async () => { h.display = true })
    render(<StartDone onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn on reminders' }))
    expect(await screen.findByRole('heading', { name: 'Where are you most days?' })).toBeTruthy()
    expect(dots(4)).toBeTruthy()
  })

  it('after two refusals the button opens the app settings (m2-3); one refusal still asks', async () => {
    render(<StartDone onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn on reminders' }))
    await waitFor(async () => expect(await kv('setup.notifDenials')).toBe(1))
    expect(screen.getByRole('button', { name: 'Turn on reminders' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on reminders' }))
    expect(await screen.findByRole('button', { name: 'Open app settings' })).toBeTruthy()
    expect(screen.getByText('Android needs you to allow notifications there.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open app settings' }))
    await waitFor(() => expect(h.openSettings).toHaveBeenCalledTimes(1))
    expect(h.turnOn).toHaveBeenCalledTimes(2) // the third tap asked nothing
  })

  it('screen 4 has chips and no latitude or longitude; a zone chip saves the zone and moves on', async () => {
    render(<StartDone onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('heading', { name: 'Where are you most days?' })).toBeTruthy()
    expect(screen.getByText('For weather and quake warnings near you. Stays on this phone.')).toBeTruthy()
    expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dampas, Tagbilaran' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Conel, GenSan' }))
    expect(await screen.findByRole('heading', { name: "Let's test it." })).toBeTruthy()
    expect(await kv('loc.zone')).toBe('conel')
    expect(await kv('loc.asked')).toBe(true)
  })

  it('Use my location: GPS moves on; a refusal stays with a plain line', async () => {
    render(<StartDone onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    h.gps.mockResolvedValueOnce({ lat: 1, lon: 2, source: 'home' })
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }))
    expect(await screen.findByText('We could not get your location. Pick a place below.')).toBeTruthy()
    h.gps.mockResolvedValueOnce({ lat: 1, lon: 2, source: 'gps' })
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(await screen.findByRole('heading', { name: "Let's test it." })).toBeTruthy()
  })

  it('Skip on 3 and 4 records nothing and counts the skip; screen 5 has the exact copy', async () => {
    render(<StartDone onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dampas, Tagbilaran' }))
    expect(await screen.findByText('Tap below. Your phone rings in 5 seconds.')).toBeTruthy()
    expect(dots(5)).toBeTruthy()
    expect(screen.getByText('Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing.')).toBeTruthy()
    expect(h.track).toHaveBeenCalledWith('action', 'onboard_skip_reminders')
    expect(await kv('setup.notifDenials')).toBeUndefined()
    expect(await kv('onboarded')).toBeUndefined() // the host never writes it: Onboarding does
  })

  it('screen 5 with reminders off says "Turn on reminders first" and goes back to screen 3', async () => {
    render(<StartDone onDone={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on reminders first' }))
    expect(await screen.findByRole('heading', { name: 'Medicine reminders' })).toBeTruthy()
    expect(dots(3)).toBeTruthy()
  })

  it('system back steps back one screen; Skip on 5 opens Today and records the consent once', async () => {
    const done = vi.fn()
    render(<StartDone onDone={done} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('heading', { name: 'Where are you most days?' })).toBeTruthy()
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(await screen.findByRole('heading', { name: 'Medicine reminders' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(done).toHaveBeenCalledTimes(1)
    expect(h.consent).toHaveBeenCalledTimes(1)
  })
})
