import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../records/trend', () => ({ trendChart: () => ({ destroy() {}, setSize() {} }) })) // uPlot needs a canvas
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
const rem = vi.hoisted(() => ({ syncDoseReminders: vi.fn(async () => 'scheduled') }))
vi.mock('./reminders', () => rem)

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
  await Promise.all([db.kv.clear(), db.outbox.clear(), hdb.readings.clear(), hdb.people.clear(), ldb.meds.clear(), ldb.activity.clear()])
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

describe('Medicines today', () => {
  it('Taken writes meds_taken (local + outbox) and ticks the earliest slot', async () => {
    await db.kv.put({ key: 'profile.medicines', value: ['Metformin 8:00,20:00', 'Aspirin'] })
    render(<Health />)
    const list = await screen.findByTestId('meds-today')
    await waitFor(() => expect(within(list).getAllByRole('button', { name: /as taken/ })).toHaveLength(2)) // one per medicine: later slots wait
    fireEvent.click(within(list).getByRole('button', { name: /Mark Metformin 8:00 AM as taken/ }))
    await waitFor(() => expect(within(list).getAllByText('Taken').length).toBeGreaterThanOrEqual(1))
    expect((await ldb.meds.toArray()).map((m) => [m.personId, m.name])).toEqual([['p1', 'Metformin']])
    expect((await db.outbox.toArray()).filter((o) => o.table === 'meds_taken')).toHaveLength(1)
    expect(within(list).getByRole('button', { name: /Mark Metformin 8:00 PM as taken/ })).toBeTruthy() // next slot is now first
  })

  it('syncs reminders from the own medicine list', async () => {
    await db.kv.put({ key: 'profile.medicines', value: ['Losartan 8:00'] })
    render(<Health />)
    await waitFor(() => expect(rem.syncDoseReminders).toHaveBeenCalledWith(['Losartan 8:00']))
  })

  it('empty state points to where medicines are added', async () => {
    render(<Health />)
    expect(await screen.findByText(/Add them in Me, or confirm a prescription in Family > Records/)).toBeTruthy()
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
