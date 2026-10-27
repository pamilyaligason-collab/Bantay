import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/client', () => ({ supabase: {}, supabaseUrl: 'https://x.test', supabasePublishableKey: 'k' }))
import ApprovePinSheet from './ApprovePinSheet'
import { adb } from '../notify/store'
import type { AlertRow } from '../notify/store'

const row = (over: Partial<AlertRow> = {}): AlertRow => ({
  id: 'a1', personId: 'p-mama', kind: 'pin_approve', template: 'pin_approve' as AlertRow['template'], ref: 'req-1',
  createdAt: new Date().toISOString(), pushedAt: null, seenAt: null, expiresAt: new Date(Date.now() + 3600_000).toISOString(), ...over
})
const key = (n: string) => screen.getByRole('button', { name: n })
const enter = (digits: string) => { for (const d of digits) fireEvent.click(key(d)) }

beforeEach(async () => {
  await adb.alerts.clear()
  localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p-mama', displayName: 'Mama Rosa', handle: 'mama', provider: 'pin' }]))
})
afterEach(() => { cleanup(); localStorage.clear() })

describe('ApprovePinSheet (start-approve-req)', () => {
  it('shows nothing without a pin_approve row, and nothing for other kinds', async () => {
    await adb.alerts.put(row({ id: 'x', kind: 'dose_missed', template: 'dose_missed' as AlertRow['template'] }))
    const { container } = render(<ApprovePinSheet />)
    await new Promise((r) => setTimeout(r, 40))
    expect(container.textContent).toBe('')
  })

  it('names the person, asks for the 4-digit number they read out, and approves with request id and code', async () => {
    await adb.alerts.put(row())
    const approve = vi.fn(async () => 'approved' as const)
    render(<ApprovePinSheet approve={approve} />)
    expect(await screen.findByRole('heading', { name: 'Mama wants a new PIN' })).toBeTruthy()
    expect(screen.getByText(/4-digit number on their screen/)).toBeTruthy()
    enter('4821')
    await waitFor(() => expect(approve).toHaveBeenCalledWith('req-1', '4821'))
    expect(await screen.findByRole('heading', { name: 'Approved' })).toBeTruthy()
    expect((await adb.alerts.get('a1'))?.seenAt).not.toBeNull() // the row is spent
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a refused number says so and stays open for another try', async () => {
    await adb.alerts.put(row())
    const approve = vi.fn(async () => 'refused' as const)
    render(<ApprovePinSheet approve={approve} />)
    await screen.findByRole('dialog')
    enter('0000')
    expect((await screen.findByRole('alert')).textContent).toBe('That number did not work. Ask Mama to read it again.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((await adb.alerts.get('a1'))?.seenAt).toBeNull()
  })

  it('no signal is not a wrong number', async () => {
    await adb.alerts.put(row())
    render(<ApprovePinSheet approve={vi.fn(async () => 'no_signal' as const)} />)
    await screen.findByRole('dialog')
    enter('4821')
    expect((await screen.findByRole('alert')).textContent).toBe('No signal. Try again when you have data.')
  })

  it('Not Mama closes the sheet and spends the row without approving', async () => {
    await adb.alerts.put(row())
    const approve = vi.fn(async () => 'approved' as const)
    render(<ApprovePinSheet approve={approve} />)
    fireEvent.click(await screen.findByRole('button', { name: /Not Mama, do not approve/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(approve).not.toHaveBeenCalled()
    expect((await adb.alerts.get('a1'))?.seenAt).not.toBeNull()
  })

  it('an expired or already seen row shows no sheet', async () => {
    await adb.alerts.put(row({ seenAt: new Date().toISOString() }))
    await adb.alerts.put(row({ id: 'a2', expiresAt: new Date(Date.now() - 1000).toISOString() }))
    const { container } = render(<ApprovePinSheet />)
    await new Promise((r) => setTimeout(r, 40))
    expect(container.textContent).toBe('')
  })
})
