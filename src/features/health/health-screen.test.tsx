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
    const bpNode = await screen.findByRole('link', { name: /^BP 130\/84 Above target/ })
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

  it('My KPIs show the latest reading with its time; the body map says it is the 7-day average', async () => {
    render(<Health />)
    const kpis = await screen.findByTestId('kpis')
    const tile = kpis.querySelector('[data-kpi="bp_systolic"]') as HTMLElement
    expect(within(tile).getByText('124/79')).toBeTruthy() // latest, not the 130/84 average on the body map
    expect(tile.textContent).toMatch(/yesterday/)
    expect(tile.getAttribute('href')).toBe('#health/metric/bp_systolic')
    expect(screen.getByTestId('avg-note').textContent).toMatch(/7-day average/)
  })

  it('Vitals has a Latest | Average | Normal toggle that changes what is shown', async () => {
    render(<Health />)
    await screen.findByRole('link', { name: /^BP 130/ })
    const row = () => document.querySelector('[data-test="bp_systolic"]') as HTMLElement
    expect(screen.getByRole('button', { name: 'Latest' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(row()).getByText('124')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Average' }))
    expect(screen.getByRole('button', { name: 'Average' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(row()).getByText('130')).toBeTruthy() // average of 124 and 136
    expect(within(row()).getByText('7-day average')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Previous' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    const normal = screen.getByTestId('normal-rows')
    expect(within(normal).getByText('70 to 99 mg/dL (3.9 to 5.5 mmol/L)')).toBeTruthy()
    expect(within(normal).getByText('60 to 100 bpm')).toBeTruthy()
    expect(within(normal).getByText(/Normal is under 120 over 80/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))
    expect(within(row()).getByText('124')).toBeTruthy()
  })

  it('Learn, Refills, Doctor visits and Papers are reachable from the overview', async () => {
    render(<Health />)
    const hrefs = async (name: RegExp) => (await screen.findByRole('link', { name })).getAttribute('href')
    expect(await hrefs(/^Health library/)).toBe('#health/library')
    expect(await hrefs(/^Videos/)).toBe('#health/videos')
    expect(await hrefs(/^Refills/)).toBe('#health/refill')
    expect(await hrefs(/^Doctor visits/)).toBe('#health/visits')
    expect(await hrefs(/^Papers · /)).toBe('#health/papers')
    expect((await screen.findByRole('link', { name: /^Papers · / })).textContent).toMatch(/Papers · (Add your first paper|\d+ of \d+ papers? checked)/)
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

  it('old readings only (no vitals this week): one no-vitals card, proper-case name, no headline, no nudge, no second avatar', async () => {
    await hdb.people.put({ id: 'p1', name: 'loyd sevilla' })
    await hdb.readings.clear()
    await hdb.readings.add({ personId: 'p1', test: 'ldl', value: 3.1, unit: 'mmol/L', takenAt: day(60) })
    render(<Health />)
    const card = await screen.findByTestId('no-vitals')
    expect(within(card).getByRole('heading', { name: 'No vitals yet for Loyd' })).toBeTruthy()
    expect(screen.getByTestId('showing').textContent).toBe('Showing: Loyd Sevilla')
    expect(screen.queryByTestId('insight')).toBeNull()
    expect(screen.queryByTestId('nudge')).toBeNull()
    expect(document.querySelector('.ad-av')).toBeNull()
    expect(screen.getAllByText(/No vitals yet/)).toHaveLength(1) // exactly one empty message
  })

  it('J r2: a lab out of range this week still shows its warning above the no-vitals card; a "SURNAME, Given" name says the given name', async () => {
    await hdb.people.put({ id: 'p1', name: 'SEVILLA, Loyd' })
    await hdb.readings.clear()
    await hdb.readings.add({ personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: day(2) })
    render(<Health />)
    const card = await screen.findByTestId('no-vitals')
    expect(within(card).getByRole('heading', { name: 'No vitals yet for Loyd' })).toBeTruthy()
    expect((await screen.findByTestId('insight')).textContent).toBe('LDL cholesterol needs a look this week')
    expect(screen.queryByTestId('nudge')).toBeNull()
  })

  it('list rows keep the status and a sparkline; range text lives on the metric screen', async () => {
    render(<Health />)
    await screen.findByRole('link', { name: /^BP 130\/84/ })
    const row = document.querySelector('[data-test="bp_systolic"]') as HTMLElement
    expect(within(row).getByText('A little raised')).toBeTruthy()
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

  it('a review line offers Yes, Dose changed and I stopped it; Yes clears it, I stopped it asks first and then moves it to Past', async () => {
    const review = { v: 1, times: ['08:00'], review: true, review_since: '2026-10-20' }
    await ldb.medications.bulkAdd([med({ name: 'Amlodipine', startedOn: '2025-11-14', schedule: review }), med({ name: 'Losartan', schedule: review })])
    render(<Health />)
    const line = await screen.findAllByText('From a prescription dated Nov 2025. Still taking it?')
    expect(line).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Yes, still taking/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, still taking Amlodipine' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Yes, still taking Amlodipine' })).toBeNull())
    expect(((await ldb.medications.where('clientId').equals('c-Amlodipine').first())?.schedule as { review?: boolean }).review).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'I stopped Losartan' }))
    const sheet = await screen.findByRole('dialog', { name: 'Stop reminders for Losartan?' }) // one tap cannot silence a medicine by accident
    expect(((await ldb.medications.where('clientId').equals('c-Losartan').first())?.medStatus ?? 'active')).toBe('active')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Stop reminders' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Dose changed, Atorvastatin' }))
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
    expect((await screen.findByRole('button', { name: 'This month' })).getAttribute('aria-pressed')).toBe('true') // 30 days is the default
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(screen.getByRole('button', { name: 'This week' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('metric-chart')).toBeTruthy()
    expect(within(screen.getByTestId('monthly')).getAllByText(/readings?$/).length).toBeGreaterThan(0)
    expect(screen.getByText(/General guide: Under 120/)).toBeTruthy()
    expect(screen.getByText(/AHA, Understanding Blood Pressure Readings/)).toBeTruthy()
    expect(screen.getByText(/not medical advice/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Health' }).getAttribute('href')).toBe('#health')
  })

  it('morning / evening toggle filters the readings list; the chart shows the normal band', async () => {
    await hdb.readings.clear()
    const at = (ago: number, h: number) => { const d = new Date(Date.now() - ago * 86_400_000); d.setHours(h, 0, 0, 0); return d.toISOString() }
    await hdb.readings.bulkAdd([
      { personId: 'p1', test: 'bp_systolic', value: 120, unit: 'mmHg', takenAt: at(1, 7) },
      { personId: 'p1', test: 'bp_systolic', value: 138, unit: 'mmHg', takenAt: at(2, 20) }
    ])
    location.hash = '#health/metric/bp_systolic'
    render(<Health />)
    await screen.findByTestId('metric-chart')
    expect(document.querySelector('.mc-band')).toBeTruthy()
    const list = () => screen.getByTestId('recent')
    expect(within(list()).getAllByText(/mmHg/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Evening' }))
    expect(within(list()).getAllByText(/mmHg/)).toHaveLength(1)
    expect(within(list()).getByText(/138/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }))
    expect(within(list()).getByText(/120/)).toBeTruthy()
  })

  it('Add reading: previews the colour and line, then saves through logReading (two rows for blood pressure)', async () => {
    location.hash = '#health/metric/bp_systolic'
    render(<Health />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add reading' }))
    fireEvent.change(screen.getByLabelText('Top'), { target: { value: '138' } })
    fireEvent.change(screen.getByLabelText('Bottom'), { target: { value: '86' } })
    const prev = await screen.findByTestId('reading-preview')
    expect(prev.getAttribute('data-state')).toBe('above')
    expect(prev.textContent).toMatch(/High.*Rest for 5 minutes/)
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    await waitFor(async () => expect(await hdb.readings.where('test').equals('bp_diastolic').count()).toBe(3))
    const rows = await hdb.readings.where('test').equals('bp_systolic').toArray()
    expect(rows.some((r) => r.value === 138)).toBe(true)
    expect(await db.outbox.where('table').equals('readings').count()).toBe(2)
  })

  it('a metric with no readings says how to fill it', async () => {
    location.hash = '#health/metric/weight'
    render(<Health />)
    expect(await screen.findByText('No readings for this yet')).toBeTruthy()
  })
})
