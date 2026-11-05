import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// D-109: Family opens on Me. The owner (invented: Rey Villar) can read Ma, Papa and Tita; Ma is the only person Rey is a writer carer of.
vi.mock('../features/auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'me', role: 'admin', handle: null, isOwner: true }) }))
vi.mock('../features/auth/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => { throw new Error('offline') } } })) // signed in, no network
vi.mock('../features/sync/SyncStatus', () => ({ SyncStatus: () => null }))
vi.mock('../features/health/useCanMark', async (orig) => ({ ...(await orig<object>()), useWritableIds: () => ['ma'] }))
vi.mock('../features/family/reportData', async (orig) => ({ ...(await orig<object>()), carerUserId: async () => 'u1', loadCarerOf: async () => ['ma'] }))
import Family from './Family'
configure({ asyncUtilTimeout: 6000 }) // the full suite loads the machine
import { ldb } from '../features/log/store'
import { hdb } from '../features/records/store'
import { db } from '../db'
import { resetFamilyScope } from '../features/family/useFamilyScope'

const NOW = new Date(2026, 9, 27, 10, 20)
const dose = (personId: string, name: string, serverId: string) => ({ personId, name, medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId }) as never

beforeEach(async () => {
  resetFamilyScope()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  location.hash = '#family'
  await Promise.all([ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), hdb.people.clear(), db.kv.clear(), db.profiles.clear()])
  await hdb.people.bulkPut([{ id: 'me', name: 'Rey Villar' }, { id: 'ma', name: 'Ma Villar' }, { id: 'pa', name: 'Papa Villar' }, { id: 'ti', name: 'Tita Villar' }])
  await ldb.medications.bulkAdd([dose('me', 'Zorbex', 'm0'), dose('ma', 'Quillon', 'm1'), dose('pa', 'Brandel', 'm2')])
})
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = '' })

describe('Family root (D-109)', () => {
  it('opens on Me: only Rey on the page; Ma appears as one line, with no medicine name and no number; Papa and Tita are not named', async () => {
    render(<Family />)
    const today = await screen.findByRole('group', { name: 'Family roll call' })
    await waitFor(() => expect(within(today).getAllByTestId('person-card')).toHaveLength(1))
    expect(within(today).getByRole('article').getAttribute('aria-label')).toMatch(/^Rey Villar \(you\)/)
    const needs = await screen.findByTestId('needs-list')
    expect(within(needs).getAllByTestId('need-row')).toHaveLength(1)
    expect(needs.textContent).toContain('Ma: missed a medicine')
    expect(needs.textContent).not.toMatch(/Quillon|Brandel|Zorbex|\d doses|\d medicines/)
    const page = document.body.textContent ?? ''
    expect(page).not.toContain('Papa')
    expect(page).not.toContain('Tita')
    expect(page).not.toContain('Quillon')
    expect(page).not.toMatch(/\d+ of \d+ checked in/)
    expect(screen.queryByText(/PEOPLE$/)).toBeNull()
  })

  it('People lists you and your links only (Ma), though the switch lists everyone', async () => {
    render(<Family />)
    const list = await screen.findByTestId('people-list')
    await waitFor(() => expect(within(list).getAllByTestId('people-row')).toHaveLength(2))
    expect(list.textContent).toContain('Ma')
    expect(list.textContent).not.toContain('Papa')
    fireEvent.click(screen.getByRole('button', { name: 'Who to show: Me' }))
    const sheet = await screen.findByRole('dialog', { name: 'Who to show' })
    expect(within(sheet).getByText('You care for')).toBeTruthy()
    expect(within(sheet).getByText('Everyone else (only your account sees these)')).toBeTruthy()
    expect(within(sheet).getByText('Family opens on Me every time.')).toBeTruthy()
    for (const n of ['Me', 'Ma Villar', 'Papa Villar', 'Tita Villar']) expect(within(sheet).getByText(n)).toBeTruthy()
  })

  it('Open on Ma\'s row puts Ma on show: her card says Missed with Mark taken, Activity names her, the pill says Ma', async () => {
    render(<Family />)
    const needs = await screen.findByTestId('needs-list')
    fireEvent.click(within(needs).getByRole('button', { name: 'Open Ma' }))
    const card = await screen.findByRole('article', { name: /^Ma Villar\. Missed a medicine/ })
    expect(within(card).getByRole('button', { name: /Mark taken/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Who to show: Ma' })).toBeTruthy()
    expect(screen.getByTestId('activity').textContent).toContain('No blood pressure readings for Ma in 7 days.')
    expect(screen.getByTestId('activity').textContent).not.toContain('Rey')
    expect(location.hash).toBe('#family') // picking never moves the hash
  })

  it('picking Papa (a view-only person for Rey) shows his card without Mark taken', async () => {
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Who to show: Me' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Who to show' })).getByText('Papa Villar'))
    const card = await screen.findByRole('article', { name: /^Papa Villar\. Missed a medicine/ })
    expect(within(card).queryByRole('button', { name: /Mark taken/ })).toBeNull()
    expect(within(card).getByRole('link', { name: 'Open Papa' })).toBeTruthy()
  })

  it('picking Papa (view only, a missed dose) adds no Needs line for him; Ma, whom Rey cares for, keeps hers', async () => {
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Who to show: Me' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Who to show' })).getByText('Papa Villar'))
    await screen.findByRole('article', { name: /^Papa Villar\. Missed a medicine/ })
    const rows = within(await screen.findByTestId('needs-list')).getAllByTestId('need-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('Ma: missed a medicine')
    expect(screen.getByTestId('needs').textContent).not.toContain('Papa:')
  })
})
