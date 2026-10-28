import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const who = vi.hoisted(() => ({ own: 'p1' }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../records/useHealthData', () => ({ useHealthData: () => ({ people: [{ id: 'p1', name: 'Test Person' }], member: { userId: 'u1', role: 'member' }, ownId: who.own }) }))
vi.mock('./useCanMark', async (orig) => ({ ...(await orig<typeof import('./useCanMark')>()), useWritableIds: () => [] }))

import { ldb, type Medication } from '../log/store'
import MedDetail from './MedDetail'
import { Medicines } from './Medicines'

const iso = (back: number, h = 12) => { const d = new Date(); d.setDate(d.getDate() - back); d.setHours(h, 0, 0, 0); return d.toISOString() }
const med = (o: Partial<Medication> = {}): Medication => ({ clientId: 'c1', serverId: 's1', personId: 'p1', name: 'Amlodipine', strength: '5 mg', dose: '1 tablet', medStatus: 'active', status: 'confirmed', schedule: { v: 1, times: ['08:00'] }, ...o })

beforeEach(async () => { who.own = 'p1'; await Promise.all([ldb.medications.clear(), ldb.meds.clear()]) })
afterEach(() => cleanup())

describe('MedDetail', () => {
  it('shows dose, times, stock with days left and the 7-day strip', async () => {
    await ldb.medications.add(med({ stockQty: 20, perDay: 1, stockSetAt: iso(0), startedOn: iso(10).slice(0, 10) }))
    render(<MedDetail medicationId="s1" />)
    const facts = within(await screen.findByTestId('med-facts'))
    expect(facts.getByText('1 tablet')).toBeTruthy()
    expect(facts.getByText('Every day at 8:00 AM')).toBeTruthy()
    expect(within(screen.getByTestId('med-stock')).getByText('20 tablets · 20 days left')).toBeTruthy()
    expect(within(await screen.findByTestId('med-week')).getAllByRole('listitem')).toHaveLength(7)
  })

  it('the reminders card promises nothing about the carers phones', async () => {
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    const card = within(await screen.findByTestId('med-reminders'))
    expect(card.getByText(/Rings at 8:00 AM/)).toBeTruthy()
    expect(card.getByText(/Told in the app after about 30 minutes/)).toBeTruthy()
    expect(card.queryByText(/Their phones ring/)).toBeNull()
  })

  it('the week header appears only with the doses in: never a 0 of N first', async () => {
    await ldb.medications.add(med({ schedule: { v: 1, times: ['23:59'] }, startedOn: iso(3).slice(0, 10) })) // tonight is never due yet, so 3 doses are due
    await ldb.meds.bulkAdd([{ personId: 'p1', name: 'Amlodipine', takenAt: iso(3, 23), medicationId: 's1', slot: '23:59' }, { personId: 'p1', name: 'Amlodipine', takenAt: iso(2, 23), medicationId: 's1', slot: '23:59' }])
    render(<MedDetail medicationId="s1" />)
    await screen.findByTestId('med-week') // the first time the week exists, its header already has the real count
    expect(screen.getByText('2 of 3 taken')).toBeTruthy()
  })

  it('someone who may not edit can read it but has no Edit or Pause', async () => {
    who.own = 'someone-else'
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    await screen.findByTestId('med-facts')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause reminders' })).toBeNull()
  })

  it('a medicine that is not here says so instead of an empty page', async () => {
    render(<MedDetail medicationId="nope" />)
    expect(await screen.findByTestId('med-gone')).toBeTruthy()
  })
})

describe('Medicines list rows', () => {
  it('link to the detail, show stock, and turn the days amber at a week or less', async () => {
    await ldb.medications.bulkAdd([
      med({ stockQty: 7, perDay: 1, stockSetAt: iso(0) }),
      med({ clientId: 'c2', serverId: 's2', name: 'Losartan', strength: '50 mg', stockQty: 24, perDay: 1, stockSetAt: iso(0) }),
      med({ clientId: 'c3', serverId: 's3', name: 'Paracetamol', strength: undefined, asNeeded: true, schedule: { v: 1, times: [] } })
    ])
    render(<Medicines personId="p1" mine canMark canEdit />)
    const rows = within(await screen.findByTestId('meds-active'))
    const amlo = rows.getByRole('link', { name: /Amlodipine 5 mg/ })
    expect(amlo.getAttribute('href')).toBe('#health/med/s1')
    expect(within(amlo).getByTestId('med-days').textContent).toBe('Refill in 7 days')
    expect(within(amlo).getByTestId('med-days').className).toContain('warn')
    const los = rows.getByRole('link', { name: /Losartan 50 mg/ })
    expect(within(los).getByTestId('med-days').textContent).toBe('24 days')
    expect(within(los).getByTestId('med-days').className).not.toContain('warn')
    expect(within(rows.getByRole('link', { name: /Paracetamol/ })).queryByTestId('med-days')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the week counter once a dose has come due', async () => {
    // a 23:59 slot: tonight is never due yet (it needs 2 more hours), so the answer does not depend on the clock the test runs at
    await ldb.medications.add(med({ schedule: { v: 1, times: ['23:59'] }, startedOn: iso(2).slice(0, 10) }))
    await ldb.meds.add({ personId: 'p1', name: 'Amlodipine', takenAt: iso(2, 23), medicationId: 's1', slot: '23:59' })
    render(<Medicines personId="p1" mine canMark canEdit />)
    const line = await screen.findByTestId('meds-week')
    expect(line.textContent).toBe('1 of 2 doses on time this week') // 2 days ago taken, yesterday missed
  })
})
