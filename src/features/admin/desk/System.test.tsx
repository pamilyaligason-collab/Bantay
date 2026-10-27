import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const tables: Record<string, { data: unknown[]; error?: boolean }> = {}
  const chain = (t: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'order', 'limit']) c[m] = () => c
    c.then = (res: (v: unknown) => unknown) => { const x = tables[t] ?? { data: [] }; return Promise.resolve(x.error ? { data: null, error: { code: 'x' } } : { data: x.data, error: null }).then(res) }
    return c
  }
  return { tables, from: (t: string) => chain(t), rpc: vi.fn() }
})
vi.mock('../../auth/client', () => ({ supabase: { from: h.from, rpc: h.rpc, functions: { invoke: vi.fn() } } }))

import System from './System'

const NOW = Date.now()
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()
const KPIS = {
  today: '2026-10-26',
  active_members: { cur: 4, prev: 5 }, screens: { cur: 120, prev: 100 }, doses_logged: { cur: 30, prev: 30 }, readings_logged: { cur: 9, prev: 4 }, client_errors: { cur: 3, prev: 3 },
  alerts: { sent: 80, due_1h: 74, seen: 76, seen_1h: 71, unseen_by_kind: { system: 2, hazard: 1 }, by_day: [{ day: '2026-10-24', total: 7, seen_1h: 5 }, { day: '2026-10-25', total: 10, seen_1h: 10 }] }
}

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.people = { data: [{ id: 'p1', display_name: 'Mama', auth_user_id: 'u1', photo_path: null }, { id: 'p2', display_name: 'Papa', auth_user_id: 'u2', photo_path: null }, { id: 'p3', display_name: 'Kuya Ben', auth_user_id: 'u3', photo_path: null }] }
  h.tables.phone_health = { data: [
    { user_id: 'u1', platform: 'android', app_version: '2.3.0', alarms_ok: true, notif_ok: true, exact_ok: true, battery_ok: true, call_ok: true, oem: null, last_open_at: iso(60), alarms_checked_at: iso(30) },
    { user_id: 'u2', platform: 'android', app_version: '2.3.0', alarms_ok: false, notif_ok: true, exact_ok: true, battery_ok: false, call_ok: true, oem: 'Xiaomi', last_open_at: iso(60), alarms_checked_at: iso(30) },
    { user_id: 'u3', platform: 'web', app_version: null, alarms_ok: null, notif_ok: null, exact_ok: null, battery_ok: null, call_ok: null, oem: null, last_open_at: iso(60 * 24 * 9), alarms_checked_at: null }
  ] }
  h.tables.job_runs = { data: [{ job: 'x', ran_at: iso(5), ok: true }] } // every job query returns this one row
  h.tables.client_errors = { data: [{ where_: 'window.onerror', message_hash: 'abc', app_version: '2.3.0', count: 3, day: new Date(NOW + 8 * 3_600_000).toISOString().slice(0, 10) }] }
  h.rpc.mockReset()
  h.rpc.mockImplementation(async (name: string) => (name === 'admin_weekly_kpis' ? { data: KPIS, error: null } : name === 'admin_pending_migrations' ? { data: ['0030', '0033'], error: null } : { data: [], error: null }))
})
afterEach(cleanup)

describe('System health page', () => {
  it('shows the four tiles with the right tones', async () => {
    render(<System id={null} />)
    expect(await screen.findByText('96%')).toBeTruthy()
    expect(screen.getByText(/alerts opened within 1 hour, last 7 days, 71 of 74/)).toBeTruthy()
    const tile = (label: string) => screen.getByText(label).closest('.dk-kpi') as HTMLElement
    await waitFor(() => expect(tile('Seen in the app').className).toContain('ok'))
    expect(tile('Phone alarm problems').className).toContain('bad') // Papa: alarms not ok
    expect(within(tile('Phone alarm problems')).getByText('1')).toBeTruthy() // the browser app is listed but not counted
    expect(within(tile('Phone alarm problems')).getByText('Papa')).toBeTruthy()
    expect(tile('Errors today').className).toContain('warn') // 3 today, 0 yesterday
    expect(within(tile('Update pending')).getByText('2')).toBeTruthy()
    expect(tile('Update pending').className).toContain('warn')
  })

  it('lists phones with problems first and says what to do', async () => {
    render(<System id={null} />)
    const card = await screen.findByRole('region', { name: 'Alarms per phone' })
    await waitFor(() => expect(within(card).getAllByRole('listitem')).toHaveLength(3))
    const names = within(card).getAllByRole('listitem').map((li) => li.querySelector('b')!.textContent)
    expect(names).toEqual(['Papa', 'Kuya Ben', 'Mama'])
    expect(within(card).getByText(/Xiaomi battery saver is on, alarms will be late/)).toBeTruthy()
    expect(within(card).getByText(/Browser app: no alarms · alerts wait until it is opened · not opened for 9 days/)).toBeTruthy()
  })

  it('shows jobs: green when recent; red when stopped or failed', async () => {
    render(<System id={null} />)
    const card = await screen.findByRole('region', { name: 'Scheduled jobs' })
    await waitFor(() => expect(within(card).getAllByRole('listitem')).toHaveLength(3))
    expect(within(card).getAllByText(/OK:/)).toHaveLength(3) // sr-only state word
    h.tables.job_runs = { data: [{ job: 'x', ran_at: iso(45), ok: true }] }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(within(card).getAllByText(/Problem:/)).toHaveLength(2)) // 45 min: the alerts feed (60 min rule) is still fine
    h.tables.job_runs = { data: [{ job: 'x', ran_at: iso(75), ok: true }] }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(within(card).getAllByText(/Problem:/)).toHaveLength(3))
    expect(within(card).getAllByText(/Stopped, last ran/)).toHaveLength(3)
  })

  it('shows unseen alerts by kind with the D-78 note, errors by version, pending updates and the weekly table', async () => {
    render(<System id={null} />)
    const unseen = await screen.findByRole('region', { name: 'Alerts nobody opened, last 7 days' })
    await within(unseen).findByText('System problems')
    expect(within(unseen).getByText('Storm and hazard warnings')).toBeTruthy()
    expect(within(unseen).getByText(/no lock-screen push on the Android app/)).toBeTruthy()
    const err = screen.getByRole('region', { name: 'App errors, last 7 days' })
    expect(await within(err).findByText('2.3.0')).toBeTruthy()
    const mig = screen.getByRole('region', { name: 'Database updates waiting' })
    expect(await within(mig).findByText('0030')).toBeTruthy(); expect(within(mig).getByText('0033')).toBeTruthy()
    const week = screen.getByRole('region', { name: 'This week' })
    const row = (await within(week).findByText('Readings logged')).closest('tr') as HTMLElement
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['9', '4', '+5'])
    expect(within((await within(week).findByText('Members who opened the app')).closest('tr') as HTMLElement).getAllByRole('cell')[2]!.textContent).toBe('-1')
  })

  it('says alert reach is not available yet when carer_alerts does not exist (alerts null), never 0%', async () => {
    h.rpc.mockImplementation(async (name: string) => (name === 'admin_weekly_kpis' ? { data: { ...KPIS, alerts: null }, error: null } : { data: [], error: null }))
    render(<System id={null} />)
    expect(await screen.findByText('Not available yet')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.getByText('Seen in the app').closest('.dk-kpi')!.className).toContain('plain')
  })

  it('one card fails on its own and retries', async () => {
    h.tables.phone_health = { data: [], error: true }
    render(<System id={null} />)
    const card = await screen.findByRole('region', { name: 'Alarms per phone' })
    await within(card).findByText('Could not load.')
    expect(await screen.findByText('96%')).toBeTruthy() // the rest loaded
    h.tables.phone_health = { data: [] }
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }))
    expect(await within(card).findByText(/No phone has checked in yet/)).toBeTruthy()
  })
})
