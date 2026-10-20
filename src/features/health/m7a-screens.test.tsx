import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.mock('./summaryImage', () => ({ renderSummaryImage: async () => new Blob(['x'], { type: 'image/png' }), shareSummary: async () => 'unsupported' })); // jsdom has no canvas
(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:test';
(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined

import Health from '../../screens/Health'
import { fdb } from '../family/store'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetPersonChoice } from '../records/useHealthData'
import { vdb } from './visitsStore'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const med = (over: Record<string, unknown>) => ({ clientId: `c-${over.name}`, serverId: `s-${over.name}`, personId: 'p1', name: 'X', medStatus: 'active', status: 'confirmed', schedule: { v: 1, times: ['08:00', '20:00'] }, ...over }) as never

beforeEach(async () => {
  resetPersonChoice()
  await Promise.all([db.kv.clear(), db.outbox.clear(), hdb.readings.clear(), hdb.people.clear(), ldb.meds.clear(), ldb.medications.clear(), fdb.tasks.clear(), vdb.appointments.clear(), vdb.followUps.clear()])
  await hdb.people.put({ id: 'p1', name: 'Maria Sample' })
  vi.clearAllMocks()
})
afterEach(cleanup)
const go = (hash: string) => { location.hash = hash }

describe('Refill', () => {
  it('shows days left and the refill date, adds a Plan task once, and sets the stock through the medications write path', async () => {
    await ldb.medications.bulkAdd([med({ name: 'Metformin', strength: '500 mg', stockQty: 14, stockSetAt: new Date().toISOString() }), med({ name: 'Vitamin D' })])
    go('#health/refill')
    render(<Health />)
    const hero = await screen.findByTestId('refill-soon')
    expect(hero.textContent).toMatch(/Metformin 500 mg: 7 days left/)
    expect(hero.textContent).toMatch(/Refill by \w{3} \d+ \w{3}\./)
    fireEvent.click(within(hero).getByRole('button', { name: 'Add refill to plan' }))
    await waitFor(async () => expect(await fdb.tasks.count()).toBe(1))
    expect((await fdb.tasks.toArray())[0]).toMatchObject({ title: 'Refill Metformin 500 mg', done: false })
    expect(screen.getByRole('status').textContent).toMatch(/Added to the Plan/)
    // set stock for the uncounted medicine
    fireEvent.click(screen.getByRole('button', { name: 'Set stock for Vitamin D' }))
    fireEvent.change(await screen.findByLabelText('How many are left now?'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await ldb.medications.where('clientId').equals('c-Vitamin D').first())?.stockQty).toBe(30))
    const m = await ldb.medications.where('clientId').equals('c-Vitamin D').first()
    expect(m?.stockSetAt).toBeTruthy()
    const up = (await db.outbox.where('table').equals('medications').toArray()).at(-1)!.payload as Record<string, unknown>
    expect(up).toMatchObject({ stockQty: 30 })
    expect(up.stockSetAt).toBeTruthy()
  })
})

describe('Doctor visits', () => {
  it('next visit card, follow-up due when no appointment exists, bring checklist, summary link; nothing is written to appointments', async () => {
    const t = new Date(); t.setDate(t.getDate() + 5); t.setHours(9, 0, 0, 0)
    await vdb.appointments.add({ clientId: 'a1', personId: 'p1', startsAt: t.toISOString(), purpose: 'Check-up', provider: 'Dr. Reyes' })
    await vdb.followUps.add({ clientId: 'r1', serverId: 'rx1', personId: 'p1', followUpOn: '2099-01-15', prescriber: 'Dr. Reyes', status: 'confirmed' })
    go('#health/visits')
    render(<Health />)
    const next = await screen.findByTestId('next-visit')
    expect(next.textContent).toMatch(/Check-up/)
    expect(next.textContent).toMatch(/9:00 AM/)
    expect((await screen.findByTestId('follow-ups')).textContent).toMatch(/Follow-up due/)
    const box = screen.getByRole('checkbox', { name: 'Medicine list' })
    fireEvent.click(box)
    expect(box.getAttribute('aria-checked')).toBe('true')
    await waitFor(async () => expect((await db.kv.get('visits.bring.p1'))?.value).toEqual(['meds']))
    expect(screen.getByRole('link', { name: 'Prepare visit summary' }).getAttribute('href')).toBe('#health/summary')
    expect(await db.outbox.where('table').anyOf('appointments', 'prescriptions').count()).toBe(0)
  })

  it('the visit summary page lists 30-day averages and medicines, and offers sharing', async () => {
    await hdb.readings.bulkAdd([{ personId: 'p1', test: 'bp_systolic', value: 130, unit: 'mmHg', takenAt: day(2) }, { personId: 'p1', test: 'bp_diastolic', value: 84, unit: 'mmHg', takenAt: day(2) }])
    await ldb.medications.add(med({ name: 'Losartan', strength: '50 mg', dose: '1 tablet', schedule: { v: 1, times: ['08:00'] } }))
    go('#health/summary')
    render(<Health />)
    const page = await screen.findByTestId('summary')
    await waitFor(() => expect(page.textContent).toMatch(/Blood pressure average 130\/84 mmHg \(1 reading/))
    await waitFor(() => expect(page.textContent).toMatch(/Losartan 50 mg: 1 tablet, 8:00 AM/))
    expect(screen.getByRole('button', { name: 'Share as picture' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show full screen' })) // the fallback where files cannot be shared
    expect(await screen.findByText('Take a screenshot to share.')).toBeTruthy()
  })
})

describe('Health library', () => {
  it('lists the medicines of the person, opens an article, shows the source line, and the offline state', async () => {
    await ldb.medications.add(med({ name: 'Metformin 500 mg tab' }))
    go('#health/library')
    render(<Health />)
    const link = await screen.findByRole('link', { name: /^Metformin/ })
    expect(link.getAttribute('href')).toBe('#health/library/m%3Ametformin')
    expect(screen.getByText(/From MedlinePlus \(U\.S\. National Library of Medicine\), summarised; not medical advice/)).toBeTruthy()
    cleanup()
    const f = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', f)
    go('#health/library/m%3Ametformin')
    render(<Health />)
    expect(await screen.findByTestId('article-offline')).toBeTruthy()
    expect(f).toHaveBeenCalledTimes(1) // one request per open
    vi.unstubAllGlobals()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })

  it('an article shows the summary and the source line from a mocked MedlinePlus answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feed: { entry: [{ title: { _value: 'Metformin' }, link: [{ href: 'https://medlineplus.gov/druginfo/meds/a696005.html' }], summary: { _value: '<p>Metformin is used to treat type 2 diabetes.</p>' } }] } }) }))
    go('#health/library/m%3Ametformin')
    render(<Health />)
    expect(await screen.findByText('Metformin is used to treat type 2 diabetes.')).toBeTruthy()
    expect(screen.getByText('From MedlinePlus (U.S. National Library of Medicine), summarised; not medical advice')).toBeTruthy()
    vi.unstubAllGlobals()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
})

describe('Videos entry points', () => {
  it('are hidden while every id is a placeholder', async () => {
    go('#health')
    render(<Health />)
    await screen.findByRole('link', { name: /^Health library/ })
    expect(screen.queryByRole('link', { name: /^Videos/ })).toBeNull()
  })
})

describe('Videos', () => {
  it('shows the fixed list; a tap never loads a player for a placeholder id', async () => {
    go('#health/videos')
    render(<Health />)
    expect(await screen.findByText('How to take your blood pressure at home')).toBeTruthy()
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Play How to take your blood pressure at home' }))
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText(/Coming soon/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Diabetes' }))
    expect(screen.queryByText('How to take your blood pressure at home')).toBeNull()
  })
})

describe('Explore your body', () => {
  it('the info panel gives what it does, your numbers, medicines that act here and a learn link', async () => {
    await hdb.readings.bulkAdd([{ personId: 'p1', test: 'bp_systolic', value: 126, unit: 'mmHg', takenAt: day(1) }, { personId: 'p1', test: 'bp_diastolic', value: 80, unit: 'mmHg', takenAt: day(1) }])
    await ldb.medications.add(med({ name: 'Amlodipine', strength: '5 mg' }))
    go('#health/body')
    render(<Health />)
    await screen.findByRole('heading', { name: 'Explore your body' })
    fireEvent.click(screen.getByRole('button', { name: 'Heart and blood' }))
    const panel = await screen.findByTestId('system-info')
    expect(panel.textContent).toMatch(/pumps blood/)
    await waitFor(() => expect(within(panel).getByRole('link', { name: /Blood pressure 126\/80/ }).getAttribute('href')).toBe('#health/metric/bp_systolic'))
    // Medicines load after the readings; wait for them too (a slower machine showed the panel without them yet).
    await waitFor(() => expect(within(screen.getByTestId('acting-here')).getByText('Amlodipine 5 mg: relaxes vessels')).toBeTruthy())
    expect(panel.textContent).toMatch(/not medical advice/)
    expect(within(panel).getByRole('link', { name: /Learn more: High blood pressure/ }).getAttribute('href')).toBe('#health/library/c%3AHigh%20blood%20pressure')
  })
})
