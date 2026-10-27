import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ probe: vi.fn(), consent: vi.fn(async () => true) }))
vi.mock('../auth/client', () => ({ supabase: {} }))
vi.mock('../auth/session', () => ({ getMember: vi.fn(async () => ({ userId: 'u1', personId: 'p-mama', role: 'member', handle: 'mama' })) }))
vi.mock('../phonecheck/probe', async (orig) => ({ ...(await orig<object>()), probe: h.probe }))
vi.mock('../phonecheck/PhoneCheckCard', () => ({ PhoneCheckCard: () => <section aria-label="Phone check">fix card</section> }))
vi.mock('./consent', () => ({ recordConsent: h.consent, flushConsent: vi.fn(), CONSENT_VERSION: '2026-10' }))
import StartDone from './StartDone'

const OK = { notif_ok: true, exact_ok: true, battery_ok: true, alarms_ok: true, call_ok: true, oem: 'samsung' }
beforeEach(async () => {
  await db.kv.clear(); h.probe.mockReset(); h.consent.mockClear()
  localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p-mama', displayName: 'Mama Rosa', handle: 'mama', provider: 'pin' }]))
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('StartDone (start-done, start-done-fix)', () => {
  it('a passing phone gets two ticks and no fix card', async () => {
    h.probe.mockResolvedValue(OK)
    render(<StartDone onDone={() => undefined} />)
    expect(await screen.findByRole('heading', { name: "You're in, Mama" })).toBeTruthy()
    expect(await screen.findByText('Alarms, phone and text apps')).toBeTruthy()
    expect(screen.getByText('Step 3 of 3 · then Today')).toBeTruthy()
    expect(screen.queryByLabelText('Phone check')).toBeNull()
  })

  it('a failing check shows the fix card but Today still opens', async () => {
    h.probe.mockResolvedValue({ ...OK, battery_ok: false })
    const done = vi.fn()
    render(<StartDone onDone={done} />)
    expect(await screen.findByLabelText('Phone check')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Today' }))
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('a web or unknown probe shows no phone tick (unknown is never "all good")', async () => {
    h.probe.mockResolvedValue({ notif_ok: null, exact_ok: null, battery_ok: null, alarms_ok: null, call_ok: null, oem: null })
    render(<StartDone onDone={() => undefined} />)
    await screen.findByRole('heading', { name: "You're in, Mama" })
    await waitFor(() => expect(h.probe).toHaveBeenCalled())
    expect(screen.queryByText('Alarms, phone and text apps')).toBeNull()
    expect(screen.getByText('PIN')).toBeTruthy()
  })

  it('Open Today records the consent notice once; it is a notice, not a question', async () => {
    h.probe.mockResolvedValue(OK)
    render(<StartDone onDone={() => undefined} />)
    expect(screen.getByText(/By using Bantay you agree to share your health records with your family/)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Today' }))
    expect(h.consent).toHaveBeenCalledTimes(1)
  })

  it('both switches start off; Bigger text and Simple mode save when turned on', async () => {
    h.probe.mockResolvedValue(OK)
    render(<StartDone onDone={() => undefined} />)
    const big = screen.getByRole('switch', { name: 'Bigger text' })
    const simple = screen.getByRole('switch', { name: 'Simple mode' })
    expect(big.getAttribute('aria-checked')).toBe('false')
    expect(simple.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(big); fireEvent.click(simple)
    await waitFor(async () => {
      expect((await db.kv.get('look.textsize'))?.value).toBe('large')
      expect((await db.kv.get('mode.simple'))?.value).toBe(true)
    })
  })
})
