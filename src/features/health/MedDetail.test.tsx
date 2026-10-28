import 'fake-indexeddb/auto'
import { Capacitor } from '@capacitor/core'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const who = vi.hoisted(() => ({ own: 'p1' }))
const sb = vi.hoisted(() => ({ writers: [] as { carer_id: string }[], asked: [] as unknown[] }))
vi.mock('../auth/client', () => ({ supabase: { from: (t: string) => ({ select: () => { const q = { eq: (k: string, v: unknown) => { sb.asked.push([t, k, v]); return q }, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: sb.writers, error: null }).then(ok) }; return q } }) } }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../records/useHealthData', () => ({ useHealthData: () => ({ people: [{ id: 'p1', name: 'Test Person' }], member: { userId: 'u1', role: 'member' }, ownId: who.own }) }))
vi.mock('./useCanMark', async (orig) => ({ ...(await orig<typeof import('./useCanMark')>()), useWritableIds: () => [] }))

import { db } from '../../db'
import { ldb, type Medication } from '../log/store'
import { hdb } from '../records/store'
import { REMIND_FOR } from './reminders'
import MedDetail from './MedDetail'
import { Medicines } from './Medicines'

const iso = (back: number, h = 12) => { const d = new Date(); d.setDate(d.getDate() - back); d.setHours(h, 0, 0, 0); return d.toISOString() }
const med = (o: Partial<Medication> = {}): Medication => ({ clientId: 'c1', serverId: 's1', personId: 'p1', name: 'Amlodipine', strength: '5 mg', dose: '1 tablet', medStatus: 'active', status: 'confirmed', schedule: { v: 1, times: ['08:00'] }, ...o })

beforeEach(async () => { vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true); who.own = 'p1'; sb.writers = []; sb.asked = []; await Promise.all([ldb.medications.clear(), ldb.meds.clear(), db.kv.clear(), hdb.people.clear()]) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('MedDetail', () => {
  it('makes no ring claim on the web version, where no alarms are scheduled', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    const card = within(await screen.findByTestId('med-reminders'))
    expect(await screen.findByText('Dose alarms ring only in the phone app, not on the web version.')).toBeTruthy()
    expect(card.queryByText(/Rings at|No alarm on this phone/)).toBeNull()
  })

  it('shows dose, times, stock with days left and the 7-day strip', async () => {
    await ldb.medications.add(med({ stockQty: 20, perDay: 1, stockSetAt: iso(0), startedOn: iso(10).slice(0, 10) }))
    render(<MedDetail medicationId="s1" />)
    const facts = within(await screen.findByTestId('med-facts'))
    expect(facts.getByText('1 tablet')).toBeTruthy()
    expect(facts.getByText('Every day at 8:00 AM')).toBeTruthy()
    expect(within(screen.getByTestId('med-stock')).getByText('20 tablets · 20 days left')).toBeTruthy()
    expect(within(await screen.findByTestId('med-week')).getAllByRole('listitem')).toHaveLength(7)
  })

  it('my own medicine: this phone rings; no carer row when nobody can mark my doses', async () => {
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    const card = within(await screen.findByTestId('med-reminders'))
    expect((await card.findByTestId('med-rings')).textContent).toBe('This phoneRings at 8:00 AM, with Taken and Snooze')
    await waitFor(() => expect(sb.asked).toContainEqual(['carers', 'person_id', 'p1']))
    expect(card.queryByTestId('med-carers-told')).toBeNull()
    expect(card.queryByText(/Their phones ring/)).toBeNull()
  })

  it("a carer viewing another person's medicine sees no ring claim", async () => {
    who.own = 'p-carer'
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    const card = within(await screen.findByTestId('med-reminders'))
    expect((await card.findByTestId('med-no-ring')).textContent).toBe('No alarm on this phone for Test')
    expect(card.queryByText(/Rings at/)).toBeNull()
  })

  it('a carer who set this phone to remind for the person sees the ring row', async () => {
    who.own = 'p-carer'
    await hdb.people.add({ id: 'p1', name: 'Test Person' } as never)
    await db.kv.put({ key: REMIND_FOR, value: ['p1'] })
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    expect((await screen.findByTestId('med-rings')).textContent).toContain('Rings at 8:00 AM')
    expect(screen.queryByTestId('med-no-ring')).toBeNull()
  })

  it('with a writer carer: the carer row says who is told and when', async () => {
    sb.writers = [{ carer_id: 'u-carer' }]
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    expect((await screen.findByTestId('med-carers-told')).textContent).toBe('Carers who can mark dosesTold in the app if no dose is logged about 30 minutes after the time')
  })

  it("the person's own login is not a carer to tell", async () => {
    sb.writers = [{ carer_id: 'u1' }] // u1 is the signed-in person (the mock member)
    await ldb.medications.add(med())
    render(<MedDetail medicationId="s1" />)
    await screen.findByTestId('med-rings')
    await waitFor(() => expect(sb.asked).toContainEqual(['carers', 'can_write', true]))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('med-carers-told')).toBeNull()
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

  it('the week line never shows 0 of N while the doses are still loading', async () => {
    await ldb.medications.add(med({ schedule: { v: 1, times: ['23:59'] }, startedOn: iso(2).slice(0, 10) }))
    await ldb.meds.add({ personId: 'p1', name: 'Amlodipine', takenAt: iso(2, 23), medicationId: 's1', slot: '23:59' })
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const real = ldb.meds.where.bind(ldb.meds)
    // the doses read waits on the gate, so the medicines are on screen before the takes are in
    const spy = vi.spyOn(ldb.meds, 'where').mockImplementation(((k: string) => ({ aboveOrEqual: (v: string) => ({ filter: (f: (m: unknown) => boolean) => ({ toArray: () => gate.then(() => real(k).aboveOrEqual(v).filter(f).toArray()) }) }) })) as never)
    const seen: string[] = []
    const watch = new MutationObserver(() => { const t = document.querySelector('[data-testid="meds-week"]')?.textContent; if (t) seen.push(t) })
    watch.observe(document.body, { subtree: true, childList: true, characterData: true })
    try {
      render(<Medicines personId="p1" mine canMark canEdit />)
      await screen.findByTestId('meds-active')
      await new Promise((r) => setTimeout(r, 30))
      expect(screen.queryByTestId('meds-week')).toBeNull() // medicines shown, doses not read yet: no line at all
      release()
      expect((await screen.findByTestId('meds-week')).textContent).toBe('1 of 2 doses on time this week')
      expect(seen.filter((t) => /^0 of/.test(t))).toEqual([])
    } finally { watch.disconnect(); spy.mockRestore() }
  })
})
