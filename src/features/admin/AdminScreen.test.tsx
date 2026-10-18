import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => {
  const invoke = vi.fn()
  const rpc = vi.fn()
  const from = vi.fn()
  return { invoke, rpc, from, sb: { functions: { invoke }, rpc, from } as unknown }
})
let connected = true
vi.mock('../auth/client', () => ({ get supabase() { return connected ? h.sb : null } }))

import AdminScreen from './AdminScreen'
import { sendBroadcast } from './broadcast'

const members = [
  { userId: 'u1', personId: 'p1', displayName: 'Lloyd', handle: null, role: 'admin', disabled: false, lastSignInAt: '2026-10-17T01:00:00Z', provider: 'google' },
  { userId: 'u2', personId: 'p2', displayName: 'Lola', handle: 'lola', role: 'member', disabled: false, lastSignInAt: null, provider: 'pin' }
]
const chain = (data: unknown) => ({ select: () => ({ order: () => ({ limit: async () => ({ data, error: null }) }) }) })
const actions = () => h.invoke.mock.calls.map((c) => (c[1] as { body: { action: string } }).body.action)

beforeEach(async () => {
  connected = true
  await db.outbox.clear()
  await db.kv.clear()
  h.invoke.mockReset(); h.rpc.mockReset(); h.from.mockReset()
  h.invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) => ({ data: o.body.action === 'list' ? { ok: true, members } : { ok: true }, error: null }))
  h.rpc.mockImplementation(async (name: string) => {
    if (name === 'admin_usage_summary') return { data: [{ user_id: 'u2', last_seen: '2026-10-16T01:00:00Z', events: 12, top_screens: [{ name: 'health', count: 7 }], active_7: true, active_30: true, alerts_on: true, sensors_on: false }], error: null }
    if (name === 'admin_import_counts') return { data: [{ person_id: 'p2', display_name: 'Lola', readings: 14, consults: 3 }], error: null }
    return { data: null, error: { message: 'no such function' } }
  })
  h.from.mockImplementation((t: string) => (t === 'news_items' ? chain([{ published_at: '2026-10-17T00:00:00Z' }]) : { select: async () => ({ data: [], error: null }) }))
})
afterEach(cleanup)

describe('AdminScreen: PIN requests', () => {
  const req = [{ id: 7, handle: 'lola', user_id: 'u2', created_at: '2026-10-17T02:00:00Z' }]
  const update = vi.fn()
  beforeEach(() => {
    update.mockReset().mockReturnValue({ eq: () => ({ select: async () => ({ data: [{ id: 7 }], error: null }) }) })
    h.from.mockImplementation((t: string) => t === 'admin_requests'
      ? { select: () => ({ eq: () => ({ is: () => ({ order: async () => ({ data: req, error: null }) }) }) }), update }
      : t === 'news_items' ? chain([]) : { select: async () => ({ data: [], error: null }) })
  })
  it('lists an open request with the first name, and Mark done closes it', async () => {
    render(<AdminScreen />)
    const btn = await screen.findByRole('button', { name: "Mark Lola's request done" })
    expect(within(btn.closest('.ad-row') as HTMLElement).getByText('Lola')).toBeTruthy()
    fireEvent.click(btn)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ handled_at: expect.any(String) }))
  })
  it('Reset PIN sets the PIN through admin-members, then closes the request', async () => {
    render(<AdminScreen />)
    const row = (await screen.findByRole('button', { name: "Mark Lola's request done" })).closest('.ad-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Reset PIN for Lola' }))
    const form = await screen.findByRole('form', { name: 'New PIN for Lola' })
    fireEvent.change(within(form).getByLabelText('New PIN (6 digits)'), { target: { value: '482915' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Set PIN' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(h.invoke).toHaveBeenCalledWith('admin-members', { body: { action: 'set_pin', userId: 'u2', pin: '482915' } })
  })
})

describe('AdminScreen', () => {
  it('renders every section with mocked data', async () => {
    render(<AdminScreen />)
    for (const t of ['Members', 'Usage', 'Safety data', 'Safety broadcast', 'Import status', 'System health']) expect(await screen.findByRole('heading', { name: t })).toBeTruthy()
    expect((await screen.findAllByText('Lola')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Active in the last 7 days')).toBeTruthy()
    expect(await screen.findByText(/14 readings · 3 visits/)).toBeTruthy()
    expect(screen.queryByText(/Assistant messages/)).toBeNull() // no RPC, hidden
  })
  it('shows a clear Not connected yet state with no client', async () => {
    connected = false
    render(<AdminScreen />)
    expect((await screen.findAllByText(/Not connected yet/)).length).toBeGreaterThan(0)
    expect(h.invoke).not.toHaveBeenCalled()
  })
  it('shows an error state when the list fails', async () => {
    h.invoke.mockResolvedValue({ data: { ok: false, error: 'not_admin' }, error: null })
    render(<AdminScreen />)
    expect((await screen.findAllByText('Only an admin can do this.')).length).toBeGreaterThan(0)
  })
  it('rejects weak PINs on the add form without calling the server', async () => {
    render(<AdminScreen />)
    const q = within(await screen.findByRole('form', { name: 'Add a member' }))
    fireEvent.change(q.getByLabelText('Name'), { target: { value: 'Ben' } })
    fireEvent.change(q.getByLabelText('Handle'), { target: { value: 'ben' } })
    for (const pin of ['12345', '111111', '123456']) {
      fireEvent.change(q.getByLabelText('PIN (6 digits)'), { target: { value: pin } })
      fireEvent.click(q.getByRole('button', { name: 'Add member' }))
      expect(await q.findByRole('alert')).toBeTruthy()
      expect(screen.queryByRole('alertdialog')).toBeNull()
    }
    expect(actions()).not.toContain('create')
  })
  it('adds a member only after confirmation', async () => {
    render(<AdminScreen />)
    const q = within(await screen.findByRole('form', { name: 'Add a member' }))
    fireEvent.change(q.getByLabelText('Name'), { target: { value: 'Ben' } })
    fireEvent.change(q.getByLabelText('Handle'), { target: { value: 'ben' } })
    fireEvent.change(q.getByLabelText('PIN (6 digits)'), { target: { value: '483920' } })
    fireEvent.click(q.getByRole('button', { name: 'Add member' }))
    const dlg = await screen.findByRole('alertdialog')
    expect(actions()).not.toContain('create')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('admin-members', { body: { action: 'create', displayName: 'Ben', handle: 'ben', pin: '483920', role: 'member' } }))
  })
  it('cancel changes nothing', async () => {
    render(<AdminScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Disable Lola' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(actions()).not.toContain('disable')
  })
  it('a safety edit stores the override and queues safety_overrides', async () => {
    render(<AdminScreen />)
    const q = within(await screen.findByRole('form', { name: 'Edit a hotline or place' }))
    fireEvent.change(q.getByLabelText('Latitude'), { target: { value: '9.65' } })
    fireEvent.change(q.getByLabelText('Longitude'), { target: { value: '123.88' } })
    fireEvent.click(q.getByRole('button', { name: 'Save' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(async () => expect((await db.outbox.toArray()).map((r) => r.table)).toEqual(['safety_overrides']))
    const row = (await db.outbox.toArray())[0]!.payload as { kind: string; key: string; data: object; removed: boolean }
    expect(row).toMatchObject({ kind: 'place', removed: false, data: { lat: 9.65, lon: 123.88 } })
    expect(Object.keys(row).sort()).toEqual(['data', 'key', 'kind', 'removed'])
    expect(Object.values((await db.kv.get('safety.overrides'))!.value as object)[0]).toMatchObject({ lat: 9.65, lon: 123.88 })
  })
})

describe('broadcast (B-7)', () => {
  it('invokes the broadcast function with exactly {t}, and refuses anything else', async () => {
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await sendBroadcast('storm_warning')).toEqual({ ok: true })
    expect(h.invoke).toHaveBeenCalledWith('broadcast', { body: { t: 'storm_warning' } })
    for (const bad of ['dose_due', 'free text', '']) expect((await sendBroadcast(bad)).ok).toBe(false)
    expect(h.invoke).toHaveBeenCalledTimes(1)
  })
  it('maps 403 to an admin-only message', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: { status: 403 } } })
    expect(await sendBroadcast('flood_watch')).toEqual({ ok: false, error: 'Only an admin can send this.' })
  })
  it('the screen sends only {t} after confirmation', async () => {
    render(<AdminScreen />)
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'flood_watch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send broadcast' }))
    expect(h.invoke.mock.calls.some((c) => c[0] === 'broadcast')).toBe(false)
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('broadcast', { body: { t: 'flood_watch' } }))
  })
})

describe('confirm dialog and PIN field', () => {
  it('focuses Cancel, is not marked modal, Escape closes and focus returns to the trigger', async () => {
    render(<AdminScreen />)
    const btn = await screen.findByRole('button', { name: 'Disable Lola' })
    btn.focus()
    fireEvent.click(btn)
    const dlg = await screen.findByRole('alertdialog')
    expect(dlg.getAttribute('aria-modal')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(within(dlg).getByRole('button', { name: 'Cancel' })))
    fireEvent.keyDown(dlg, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(btn))
    expect(actions()).not.toContain('disable')
  })
  it('clears the PIN field on cancel and on failure', async () => {
    render(<AdminScreen />)
    const q = within(await screen.findByRole('form', { name: 'Add a member' }))
    const fill = () => {
      fireEvent.change(q.getByLabelText('Name'), { target: { value: 'Ben' } })
      fireEvent.change(q.getByLabelText('Handle'), { target: { value: 'ben' } })
      fireEvent.change(q.getByLabelText('PIN (6 digits)'), { target: { value: '483920' } })
      fireEvent.click(q.getByRole('button', { name: 'Add member' }))
    }
    fill()
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect((q.getByLabelText('PIN (6 digits)') as HTMLInputElement).value).toBe('')
    h.invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) => (o.body.action === 'create' ? { data: { ok: false, error: 'handle_taken' }, error: null } : { data: { ok: true, members }, error: null }))
    fill()
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('That handle is taken.')).toBeTruthy()
    expect((q.getByLabelText('PIN (6 digits)') as HTMLInputElement).value).toBe('')
  })
})

describe('unlinkCarer', () => {
  const del = (data: unknown[]) => ({ delete: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data, error: null }) }) }) }) })
  it('reports forbidden when no row was deleted, ok when one was', async () => {
    const { unlinkCarer } = await import('./api')
    h.from.mockImplementation(() => del([]))
    expect(await unlinkCarer('c', 'p')).toEqual({ ok: false, error: 'forbidden' })
    h.from.mockImplementation(() => del([{}]))
    expect(await unlinkCarer('c', 'p')).toEqual({ ok: true, data: null })
  })
})
