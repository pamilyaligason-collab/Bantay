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
vi.mock('../auth/session', () => ({ getAccessToken: async () => 'tok' }))

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
    expect(Object.values((await db.kv.get('safety.overrides'))!.value as object)[0]).toMatchObject({ lat: 9.65, lon: 123.88 })
  })
})

describe('broadcast (B-7)', () => {
  it('POSTs exactly {t} with the admin bearer, and refuses anything else', async () => {
    vi.stubEnv('VITE_BROADCAST_URL', 'https://n8n.test/webhook/bantay-broadcast')
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(await sendBroadcast('storm_warning', f as unknown as typeof fetch)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://n8n.test/webhook/bantay-broadcast')
    expect(init.body).toBe('{"t":"storm_warning"}')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    for (const bad of ['dose_due', 'free text', '']) expect((await sendBroadcast(bad, f as unknown as typeof fetch)).ok).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
  })
  it('the screen sends only {t} after confirmation', async () => {
    vi.stubEnv('VITE_BROADCAST_URL', 'https://n8n.test/b')
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    render(<AdminScreen />)
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'flood_watch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send broadcast' }))
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe('{"t":"flood_watch"}')
    vi.unstubAllGlobals(); vi.unstubAllEnvs()
  })
})
