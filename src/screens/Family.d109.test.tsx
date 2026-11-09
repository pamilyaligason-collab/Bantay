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
import { fdb } from '../features/family/store'
import { resetFamilyScope } from '../features/family/useFamilyScope'

const NOW = new Date(2026, 9, 27, 10, 20)
const dose = (personId: string, name: string, serverId: string) => ({ personId, name, medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId }) as never

beforeEach(async () => {
  resetFamilyScope()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  location.hash = '#family'
  await Promise.all([fdb.events.clear(), fdb.tasks.clear(), fdb.notes.clear(), ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), hdb.people.clear(), db.kv.clear(), db.profiles.clear()])
  await hdb.people.bulkPut([{ id: 'me', name: 'Rey Villar' }, { id: 'ma', name: 'Ma Villar' }, { id: 'pa', name: 'Papa Villar' }, { id: 'ti', name: 'Tita Villar' }])
  await ldb.medications.bulkAdd([dose('me', 'Zorbex', 'm0'), dose('ma', 'Quillon', 'm1'), dose('pa', 'Brandel', 'm2')])
  const at = (h: number) => new Date(2026, 9, 27, h, 0).toISOString() // Plan rows today for people Rey may not read, and one for Ma
  await fdb.events.bulkPut([
    { clientId: 'e1', title: 'Checkup', startsAt: at(14), endsAt: null, allDay: false, personId: 'pa' },
    { clientId: 'e2', title: 'Clinic', startsAt: at(15), endsAt: null, allDay: false, personId: 'ti' },
    { clientId: 'e3', title: 'Dentist', startsAt: at(16), endsAt: null, allDay: false, personId: 'ma' }
  ])
  await fdb.tasks.put({ clientId: 't1', title: 'Fetch pills', due: '2026-10-27', assigneePersonId: 'pa', done: false })
})
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = '' })

const peopleRows = async () => {
  const list = await screen.findByTestId('people-list')
  await waitFor(() => expect(within(list).getAllByTestId('people-row')).toHaveLength(2))
  return list
}

describe('Family root (D-109)', () => {
  it('opens on Me: Rey and Ma are the only People cards; Ma reads as one line with no medicine name and no number; Papa and Tita are named nowhere, Calendar rows included', async () => {
    render(<Family />)
    await peopleRows()
    const needs = await screen.findByTestId('needs-list')
    expect(within(needs).getAllByTestId('need-row')).toHaveLength(1)
    expect(needs.textContent).toContain('Ma: missed a medicine')
    expect(needs.textContent).not.toMatch(/Quillon|Brandel|Zorbex|\d doses|\d medicines/)
    const cal = screen.getByTestId('calendar')
    await waitFor(() => expect(cal.textContent).toContain('Fetch pills')) // Plan rows for Papa and Tita still show, but under "Family", not by name
    const rows = within(within(cal).getByRole('list', { name: 'Today' })).getAllByRole('listitem')
    expect(rows.find((r) => r.textContent?.includes('Fetch pills'))!.textContent).toContain('Family')
    const events = rows.filter((r) => r.getAttribute('data-kind') === 'event').map((r) => r.textContent ?? '')
    expect(events).toHaveLength(3) // other people's events still show that something is on, but only as an appointment: no title (D-109)
    for (const e of events) expect(e).toContain('Doctors & Lab Appointments')
    expect(events.filter((e) => e.includes('Ma'))).toHaveLength(1) // Ma is named by her given name; Papa and Tita, whom Rey cannot read, read as Family member
    expect(events.filter((e) => e.includes('Family member'))).toHaveLength(2)
    expect(cal.textContent).not.toMatch(/Checkup|Clinic|Dentist/)
    const doses = rows.filter((r) => r.getAttribute('data-kind') === 'dose').map((r) => r.querySelector('.grow')!.textContent)
    expect(doses).toHaveLength(2) // Rey's own dose keeps its name; Ma's says only that one is due; Papa's is not there at all
    expect(doses.find((t) => t?.includes('Zorbex'))).toBeTruthy()
    expect(doses).toContain('Medicine timeMa')
    const page = document.body.textContent ?? ''
    expect(page).not.toContain('Papa')
    expect(page).not.toContain('Tita')
    expect(page).not.toContain('Quillon') // the whole page: no other person's medicine name, Calendar card included (D-109 3.2)
    expect(page).not.toContain('Brandel')
    expect(page).not.toMatch(/\d+ of \d+ checked in/)
    expect(screen.queryByRole('group', { name: 'Family roll call' })).toBeNull() // the old Today list is gone
  })

  it('People lists you and your links only (Ma), though the switch lists everyone', async () => {
    render(<Family />)
    const list = await peopleRows()
    expect(list.textContent).toContain('Ma')
    expect(list.textContent).not.toContain('Papa')
    fireEvent.click(screen.getByRole('button', { name: 'Who to show: Me' }))
    const sheet = await screen.findByRole('dialog', { name: 'Who to show' })
    expect(within(sheet).getByText('You care for')).toBeTruthy()
    expect(within(sheet).getByText('Everyone else (only your account sees these)')).toBeTruthy()
    expect(within(sheet).getByText('Family opens on Me every time.')).toBeTruthy()
    for (const n of ['Me', 'Ma Villar', 'Papa Villar', 'Tita Villar']) expect(within(sheet).getByText(n)).toBeTruthy()
  })

  it("Ma's People card says Missed with Mark taken; picking Ma puts her on show: Activity names her, the pill says Ma", async () => {
    render(<Family />)
    const list = await peopleRows()
    const ma = within(list).getAllByTestId('people-row').find((r) => r.textContent?.includes('Ma'))!
    await waitFor(() => expect(ma.textContent).toMatch(/Missed a medicine/))
    expect(within(ma).getByRole('button', { name: /Mark taken/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Who to show: Me' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Who to show' })).getByText('Ma Villar'))
    expect(await screen.findByRole('button', { name: 'Who to show: Ma' })).toBeTruthy()
    expect(screen.getByTestId('activity').textContent).toContain('No blood pressure readings for Ma in 7 days.')
    expect(screen.getByTestId('activity').textContent).not.toContain('Rey')
    expect(location.hash).toBe('#family') // picking never moves the hash
  })

  it('picking Papa (a view-only person for Rey) puts no Mark taken on the page for him; only Ma, whom Rey cares for, has one', async () => {
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Who to show: Me' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Who to show' })).getByText('Papa Villar'))
    expect(await screen.findByRole('button', { name: 'Who to show: Papa' })).toBeTruthy()
    const list = await peopleRows()
    await waitFor(() => expect(list.textContent).toMatch(/Missed a medicine/))
    const marks = screen.getAllByRole('button', { name: /Mark taken/ })
    expect(marks).toHaveLength(1)
    expect(within(marks[0]!.closest('[data-testid="people-row"]') as HTMLElement).getByText('Ma')).toBeTruthy()
    expect(within(list).queryByText(/Papa/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open Papa' })).toBeNull() // that link lived on the old Today card, which the S26 layout removed; Papa is not linked, so no People row offers one either
  })

  it('picking Papa (view only, a missed dose) adds no Needs line for him; Ma, whom Rey cares for, keeps hers', async () => {
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Who to show: Me' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Who to show' })).getByText('Papa Villar'))
    expect(await screen.findByRole('button', { name: 'Who to show: Papa' })).toBeTruthy()
    const rows = within(await screen.findByTestId('needs-list')).getAllByTestId('need-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('Ma: missed a medicine')
    expect(screen.getByTestId('needs').textContent).not.toContain('Papa:')
  })
})
