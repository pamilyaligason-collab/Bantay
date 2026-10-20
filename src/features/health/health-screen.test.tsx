import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../records/trend', () => ({ trendChart: () => ({ destroy() {}, setSize() {} }) })) // uPlot needs a canvas
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

import Health from '../../screens/Health'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetPersonChoice } from '../records/useHealthData'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const bp = (sys: number, dia: number, ago: number) => [
  { personId: 'p1', test: 'bp_systolic', value: sys, unit: 'mmHg', takenAt: day(ago) },
  { personId: 'p1', test: 'bp_diastolic', value: dia, unit: 'mmHg', takenAt: day(ago) }
]

beforeEach(async () => {
  location.hash = '#health'
  resetPersonChoice()
  await Promise.all([db.kv.clear(), db.outbox.clear(), hdb.readings.clear(), hdb.people.clear(), ldb.meds.clear(), ldb.activity.clear(), ldb.medications.clear()])
  await hdb.people.put({ id: 'p1', name: 'Maria Sample' })
  await hdb.readings.bulkAdd([...bp(124, 79, 1), ...bp(136, 88, 6)])
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('Health overview', () => {
  it('shows the headline, the body map values and a tappable latest list', async () => {
    render(<Health />)
    await waitFor(() => expect(screen.getByTestId('insight').textContent).toBe('Blood pressure needs a look this week'))
    const bpNode = await screen.findByRole('link', { name: /^BP 124\/79 A bit high/ })
    expect(bpNode.getAttribute('href')).toBe('#health/metric/bp_systolic')
    expect(screen.getByRole('link', { name: /^Sleep -- No data yet/ })).toBeTruthy() // unknown stays unknown
    fireEvent.click(document.querySelector('[data-test="bp_systolic"]')!)
    expect(location.hash).toBe('#health/metric/bp_systolic')
  })

  it('has an Explore your body card that opens the body explorer', async () => {
    render(<Health />)
    const card = await screen.findByRole('link', { name: /^Explore your body/ })
    expect(card.getAttribute('href')).toBe('#health/body')
    location.hash = '#health/body'
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(await screen.findByRole('heading', { name: 'Explore your body' })).toBeTruthy()
  })

  it('Previous adds the Before line from the earlier reading', async () => {
    render(<Health />)
    const sw = await screen.findByRole('switch', { name: 'Previous' })
    expect(screen.queryByText(/^Before:/)).toBeNull()
    fireEvent.click(sw)
    const row = document.querySelector('[data-test="bp_systolic"]') as HTMLElement
    expect(within(row).getByText(/^Before: 136 mmHg on .*, down 12, closer to normal$/)).toBeTruthy()
    expect(row.querySelector('.hv-dot.prev')).toBeTruthy()
  })

  it('empty state: dimmed figure and exactly one call to action', async () => {
    await hdb.readings.clear()
    render(<Health />)
    const empty = await screen.findByTestId('health-empty')
    expect((await screen.findByTestId('insight')).textContent).toBe('No results yet')
    expect(within(empty).getAllByRole('link')).toHaveLength(1)
    expect(within(empty).getByRole('link', { name: 'Log a reading' }).getAttribute('href')).toBe('#today') // p1 is the signed-in person
    expect(screen.queryByText('No data yet')).toBeNull()
    expect(document.querySelector('[data-node]')).toBeNull()
  })

  it('list rows keep the status and a sparkline; range text lives on the metric screen', async () => {
    render(<Health />)
    await screen.findByRole('link', { name: /^BP 124/ })
    const row = document.querySelector('[data-test="bp_systolic"]') as HTMLElement
    expect(within(row).getByText('High')).toBeTruthy()
    expect(row.querySelector('.hv-state.above')?.textContent).toContain('Above range')
    expect(row.querySelector('svg.hv-spark')).toBeTruthy()
    expect(within(row).queryByText(/Lab range|General guide/)).toBeNull()
  })
})

const med = (over: Record<string, unknown>) => ({ clientId: `c-${over.name}`, serverId: `s-${over.name}`, personId: 'p1', name: 'X', medStatus: 'active', status: 'confirmed', schedule: { v: 1, times: ['08:00'] }, ...over }) as never

describe('Medicines screen', () => {
  beforeEach(async () => { location.hash = '#health/meds'; await ldb.medications.clear() })

  it('the overview shows a summary that opens Health > Medicines', async () => {
    location.hash = '#health'
    await ldb.medications.bulkAdd([med({ name: 'Metformin', schedule: { v: 1, times: ['08:00', '20:00'] } })])
    render(<Health />)
    const link = await screen.findByTestId('meds-summary')
    expect(link.getAttribute('href')).toBe('#health/meds')
    await waitFor(() => expect(link.textContent).toContain('0 of 2 doses today'))
  })

  it('has Today, Active, Paused and Past sections, grouped by status', async () => {
    await ldb.medications.bulkAdd([
      med({ name: 'Metformin', strength: '500 mg', schedule: { v: 1, times: ['08:00', '20:00'] } }),
      med({ name: 'Paracetamol', asNeeded: true, schedule: { v: 1, times: [] } }),
      med({ name: 'Vitamin B', medStatus: 'paused' }),
      med({ name: 'Amoxicillin', medStatus: 'stopped', stoppedOn: '2024-11-20' }),
      med({ name: 'Gone', deletedAt: '2026-10-01T00:00:00Z' })
    ])
    render(<Health />)
    const today = await screen.findByTestId('meds-today')
    expect(within(today).getAllByText(/Metformin 500 mg/)).toHaveLength(2)
    expect(within(today).getByText('8:00 AM')).toBeTruthy()
    expect(within(today).getByText('8:00 PM')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(within(screen.getByTestId('meds-active')).getByText('As needed')).toBeTruthy()
    expect(within(screen.getByTestId('meds-paused')).getByText('Vitamin B')).toBeTruthy()
    expect(within(screen.getByTestId('meds-past')).getByText('Amoxicillin')).toBeTruthy()
    expect(screen.queryByText('Gone')).toBeNull()
  })

  it('Take writes a dose with the medication id and slot, Skip writes skipped; both show on the row', async () => {
    await ldb.medications.bulkAdd([med({ name: 'Metformin', schedule: { v: 1, times: ['08:00', '20:00'] } })])
    render(<Health />)
    const today = await screen.findByTestId('meds-today')
    fireEvent.click(within(today).getByRole('button', { name: 'Take Metformin 8:00 AM' }))
    await waitFor(() => expect(within(today).getByText(/^Taken \d/)).toBeTruthy())
    fireEvent.click(within(today).getByRole('button', { name: 'Skip Metformin 8:00 PM' }))
    await waitFor(() => expect(within(today).getAllByText('Skipped').length).toBeGreaterThan(0))
    const rows = await ldb.meds.toArray()
    expect(rows.map((r) => [r.medicationId, r.slot, !!r.skipped])).toEqual([['s-Metformin', '08:00', false], ['s-Metformin', '20:00', true]])
    expect((await db.outbox.toArray()).filter((o) => o.table === 'meds_taken')).toHaveLength(2)
  })

  it('a review line offers Yes, Change and Stopped; Yes clears it, Stopped moves it to Past', async () => {
    const review = { v: 1, times: ['08:00'], review: true, review_since: '2026-10-20' }
    await ldb.medications.bulkAdd([med({ name: 'Amlodipine', startedOn: '2025-11-14', schedule: review }), med({ name: 'Losartan', schedule: review })])
    render(<Health />)
    const line = await screen.findAllByText('From a prescription dated Nov 2025. Still taking it?')
    expect(line).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Yes, still taking/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, still taking Amlodipine' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Yes, still taking Amlodipine' })).toBeNull())
    expect(((await ldb.medications.where('clientId').equals('c-Amlodipine').first())?.schedule as { review?: boolean }).review).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Losartan stopped' }))
    await waitFor(() => expect(within(screen.getByTestId('meds-past')).getByText('Losartan')).toBeTruthy())
    const stopped = await ldb.medications.where('clientId').equals('c-Losartan').first()
    expect([stopped?.medStatus, stopped?.stoppedOn]).toEqual(['stopped', new Date().toLocaleDateString('en-CA')])
  })

  it('Change opens the edit sheet; rows with no time say Set a time, unsure names say Check the name', async () => {
    await ldb.medications.bulkAdd([
      med({ name: 'Atorvastatin', schedule: { v: 1, times: [], needs_time: true, review: true } }),
      med({ name: 'Lozartan', schedule: { v: 1, times: ['08:00'], needs_check: true } })
    ])
    render(<Health />)
    expect(await screen.findByText('Set a time')).toBeTruthy()
    expect(screen.getByText('Check the name')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Change Atorvastatin' }))
    expect(await screen.findByRole('dialog', { name: 'Edit medicine' })).toBeTruthy()
  })

  it('Add opens an empty sheet and saves a confirmed medicine with a time', async () => {
    render(<Health />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Add medicine' }))
    fireEvent.change(sheet.getByLabelText('Name'), { target: { value: 'Losartan' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await ldb.medications.count()).toBe(1))
    expect((await ldb.medications.toArray())[0]).toMatchObject({ name: 'Losartan', status: 'confirmed', medStatus: 'active', personId: 'p1' })
  })

  it('empty state says how to add one', async () => {
    render(<Health />)
    expect(await screen.findByText(/Tap Add to put one in/)).toBeTruthy()
  })
})

describe('Metric detail', () => {
  it('shows latest, period switch, monthly averages, range source and the tips card', async () => {
    location.hash = '#health/metric/bp_systolic'
    render(<Health />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Blood pressure, top number' })).toBeTruthy()
    expect((await screen.findByRole('button', { name: 'This week' })).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByRole('button', { name: 'This month' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByTestId('monthly')).getAllByText(/readings?$/).length).toBeGreaterThan(0)
    expect(screen.getByText(/General guide: Under 120/)).toBeTruthy()
    expect(screen.getByText(/AHA, Understanding Blood Pressure Readings/)).toBeTruthy()
    expect(screen.getByText(/not medical advice/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Health' }).getAttribute('href')).toBe('#health')
  })

  it('a metric with no readings says how to fill it', async () => {
    location.hash = '#health/metric/weight'
    render(<Health />)
    expect(await screen.findByText('No readings for this yet')).toBeTruthy()
  })
})
