import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ member: { userId: 'u1', personId: 'p1', role: 'member', handle: null } as { userId: string; personId: string | null; role: string; handle: string | null } | null, carers: [] as string[] }))
vi.mock('../auth/session', () => ({ getMember: async () => h.member }))
vi.mock('../auth/client', () => ({
  supabase: { from: () => { const q: any = { select: () => q, eq: () => q, then: (f: (v: unknown) => unknown) => Promise.resolve({ data: h.carers.map((person_id) => ({ person_id })), error: null }).then(f) }; return q } }
}))
vi.mock('./roster', () => ({
  useFamilyPeople: () => ({ people: [{ id: 'p1', name: 'Ana Sample', isMe: true }, { id: 'p2', name: 'Lola Sample', isMe: false }], selfId: 'p1' })
}))
import Report from './Report'
import { hdb } from '../records/store'

beforeEach(async () => { await db.kv.clear(); await hdb.readings.clear(); h.member = { userId: 'u1', personId: 'p1', role: 'member', handle: null }; h.carers = [] })
afterEach(cleanup)

const seedFor = (personId: string) => hdb.readings.bulkAdd([
  { personId, takenAt: new Date().toISOString(), test: 'bp_systolic', value: 150, unit: 'mmHg' },
  { personId, takenAt: new Date().toISOString(), test: 'bp_diastolic', value: 95, unit: 'mmHg' }
])

describe('Report permission gate', () => {
  it('refuses a signed-in member who is not the person, a carer or an admin, and shows no numbers', async () => {
    await seedFor('p2')
    render(<Report id="p2" />)
    expect(await screen.findByText('You do not have access to this report')).toBeTruthy()
    expect(screen.queryByTestId('rp-vitals')).toBeNull()
    expect(screen.queryByText(/150/)).toBeNull()
  })
  it('opens for a read-only carer of the person', async () => {
    h.carers = ['p2']
    await seedFor('p2')
    render(<Report id="p2" />)
    expect(await screen.findByTestId('report')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('rp-vitals').textContent).toMatch(/150\/95/))
    expect(screen.getByRole('button', { name: /Print or save as PDF for the doctor/ })).toBeTruthy()
  })
  it('opens for an admin and for the person themself', async () => {
    h.member = { ...h.member!, role: 'admin' }
    render(<Report id="p2" />)
    expect(await screen.findByTestId('report')).toBeTruthy()
    cleanup()
    h.member = { userId: 'u1', personId: 'p1', role: 'member', handle: null }
    render(<Report id="p1" />)
    expect(await screen.findByTestId('report')).toBeTruthy()
  })
  it('says there is nothing yet, rather than showing zeros, when the phone has no data', async () => {
    render(<Report id="p1" />)
    expect(await screen.findByText(/Nothing to report yet/)).toBeTruthy()
  })
})
