import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const tables: Record<string, { data: unknown[]; count?: number; error?: boolean }> = {}
  const chain = (t: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'not', 'is', 'order', 'range', 'limit', 'in']) c[m] = () => c
    c.then = (res: (v: unknown) => unknown) => { const x = tables[t] ?? { data: [] }; return Promise.resolve(x.error ? { data: null, error: { code: 'x' }, count: null } : { data: x.data, error: null, count: x.count ?? x.data.length }).then(res) }
    return c
  }
  return { tables, from: (t: string) => chain(t), invoke: vi.fn(), rpc: vi.fn() }
})
vi.mock('../../auth/client', () => ({ supabase: { from: h.from, rpc: h.rpc, functions: { invoke: h.invoke } } }))
vi.mock('./ScheduleCard', () => ({ default: () => <section className="dk-card dk-s4" aria-label="Schedule and reminders" /> }))

import Home from './Home'

const MEMBERS = [
  { userId: 'u1', personId: 'p1', displayName: 'Test Admin', handle: null, role: 'admin', disabled: false, lastSignInAt: null, provider: 'google', profile: null, lockedUntil: null, fails: 0 },
  { userId: 'u2', personId: 'p2', displayName: 'Test Person', handle: 'tp', role: 'member', disabled: false, lastSignInAt: null, provider: 'pin', profile: null, lockedUntil: '2999-01-01T00:00:00Z', fails: 5 },
  { userId: 'u3', personId: 'p3', displayName: 'Test Gone', handle: 'tg', role: 'member', disabled: true, lastSignInAt: null, provider: 'pin', profile: null }
]

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.people = { data: [{ id: 'p1', display_name: 'Test Admin', auth_user_id: 'u1', photo_path: null }, { id: 'p2', display_name: 'Test Person', auth_user_id: 'u2', photo_path: null }] }
  h.tables.records_queue = { data: [{ person_id: 'p2', kind: 'lab_results', drafts: 6 }, { person_id: 'p2', kind: 'documents', drafts: 1 }, { person_id: 'p1', kind: 'vaccinations', drafts: 2 }] }
  h.tables.source_files = { data: [], count: 3 }
  h.tables.person_identifiers = { data: [{ id: 'i1', person_id: 'p1', id_type: 'passport', expires_on: '2999-01-01' }] }
  h.tables.insurance_policies = { data: [] }
  h.tables.audit_log = { data: [{ id: 1, at: new Date().toISOString(), actor: 'u1', tbl: 'lab_results', person_id: 'p2', action: 'confirm', fields: ['status'] }] }
  h.invoke.mockReset(); h.rpc.mockReset()
  h.invoke.mockResolvedValue({ data: { ok: true, members: MEMBERS }, error: null })
  h.rpc.mockImplementation(async (name: string) => (name === 'admin_usage_summary' ? { data: [{ user_id: 'u1', active_7: true }, { user_id: 'u3', active_7: true }], error: null } : { data: [], error: null }))
})
afterEach(cleanup)

describe('Home', () => {
  it('shows counts, tones and the needs-you list', async () => {
    render(<Home id={null} />)
    expect(await screen.findByText('1 / 2')).toBeTruthy() // disabled member is not a member for the ratio
    const failed = screen.getByRole('link', { name: /Failed scans/ })
    await waitFor(() => expect(failed.className).toContain('bad'))
    expect(screen.getByRole('link', { name: /To confirm/ }).className).toContain('warn')
    expect(screen.getByRole('link', { name: /IDs expiring/ }).className).toContain('plain') // 2999 is outside the window
    const need = screen.getByRole('region', { name: 'Needs you' })
    expect(await within(need).findByText('3 scans failed')).toBeTruthy()
    expect(within(need).getByText('Test Person is locked out')).toBeTruthy()
    const q = screen.getByRole('region', { name: 'Confirm queue by person' })
    expect((await within(q).findAllByRole('row')).length).toBe(3) // header + 2 people
    expect(screen.getByRole('region', { name: 'Recent changes' })).toBeTruthy()
  })

  it('says nothing needs you when all is clear, and zero tiles stay plain', async () => {
    h.tables.source_files = { data: [], count: 0 }
    h.tables.records_queue = { data: [] }
    h.invoke.mockResolvedValue({ data: { ok: true, members: [MEMBERS[0]] }, error: null })
    render(<Home id={null} />)
    expect(await screen.findByText('Nothing needs you right now.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Failed scans/ }).className).toContain('plain')
    expect(screen.getByRole('link', { name: /To confirm/ }).className).toContain('plain')
  })

  it('shows who has seen the alerts (S8) and hides the line when reach is unknown', async () => {
    const alerts = { sent: 80, due_1h: 74, seen: 76, seen_1h: 71, unseen_by_kind: { system: 2, hazard: 1 }, by_day: [] }
    const kpis = { today: '2026-10-26', active_members: { cur: 1, prev: 1 }, screens: { cur: 1, prev: 1 }, doses_logged: { cur: 0, prev: 0 }, readings_logged: { cur: 0, prev: 0 }, client_errors: { cur: 0, prev: 0 }, alerts }
    h.rpc.mockImplementation(async (name: string) => (name === 'admin_weekly_kpis' ? { data: kpis, error: null } : name === 'admin_usage_summary' ? { data: [], error: null } : { data: [], error: null }))
    const { unmount } = render(<Home id={null} />)
    const line = (await screen.findByText(/96% of alerts opened/)).closest('.hm-seen') as HTMLElement
    expect(line.textContent).toContain('96% of alerts opened within 1 hour (71 of 74), last 7 days · 3 not opened yet')
    expect(within(line).getByRole('link', { name: 'System health' }).getAttribute('href')).toBe('#/system')
    unmount()
    h.rpc.mockImplementation(async (name: string) => (name === 'admin_weekly_kpis' ? { data: { ...kpis, alerts: null }, error: null } : { data: [], error: null }))
    render(<Home id={null} />)
    expect(await screen.findByText('0 / 2')).toBeTruthy() // the cards loaded (no usage rows in this case)
    expect(screen.queryByText(/of alerts opened/)).toBeNull() // before 0030: nothing shown, never 0%
  })

  it('fails one card on its own and retries it', async () => {
    h.tables.audit_log = { data: [], error: true }
    render(<Home id={null} />)
    const card = await screen.findByRole('region', { name: 'Recent changes' })
    await within(card).findByText('Could not load.')
    expect(await screen.findByText('1 / 2')).toBeTruthy() // the rest still loaded
    h.tables.audit_log = { data: [{ id: 2, at: new Date().toISOString(), actor: null, tbl: 'people', person_id: null, action: 'update', fields: ['phone'] }] }
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }))
    expect(await within(card).findByText('System')).toBeTruthy()
  })
})
