import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { PinnedTiles } from './PinnedTiles'
import type { Reading } from './ranges'
import { vdb } from './visitsStore'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const bp = (sys: number, dia: number, ago: number): Reading[] => [
  { personId: 'p1', test: 'bp_systolic', value: sys, unit: 'mmHg', takenAt: day(ago) },
  { personId: 'p1', test: 'bp_diastolic', value: dia, unit: 'mmHg', takenAt: day(ago) }
]
const show = (readings: Reading[] = []) => render(<PinnedTiles personId="p1" readings={readings} />)

beforeEach(async () => {
  await Promise.all([db.kv.clear(), ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), vdb.appointments.clear(), vdb.followUps.clear()])
})
afterEach(cleanup)

describe('PinnedTiles', () => {
  it('four tiles with their doors', async () => {
    show()
    await screen.findByTestId('glance-steps')
    const hrefs = Object.fromEntries(['progress', 'meds', 'steps', 'visit'].map((k) => [k, screen.getByTestId(`glance-${k}`).getAttribute('href')]))
    expect(hrefs).toEqual({ progress: '#health/metric/bp_systolic', meds: '#health/meds', steps: '#me/phone', visit: '#health/visits' })
    expect(screen.getByTestId('glance')).toBeTruthy()
  })
  it('BP: latest pair this week, or "--/--" with Log now', async () => {
    show([...bp(124, 79, 1), ...bp(150, 90, 20)])
    expect((await screen.findByTestId('glance-progress')).textContent).toContain('124/79')
    cleanup()
    show(bp(150, 90, 20))
    const t = await screen.findByTestId('glance-progress')
    expect(t.textContent).toContain('--/--')
    expect(t.textContent).toContain('None this week')
    expect(t.textContent).toContain('Log now')
  })
  it('Medicines: none added, then doses left today', async () => {
    show()
    await waitFor(() => expect(screen.getByTestId('glance-meds').textContent).toContain('None added'))
    expect(screen.getByTestId('glance-meds').textContent).toContain('Add or scan')
    await ldb.medications.add({ personId: 'p1', name: 'Metformin', schedule: { v: 1, times: ['08:00', '20:00'] } } as never)
    await waitFor(() => expect(screen.getByTestId('glance-meds').textContent).toContain('2 of 2 left today'))
  })
  it('Steps: Not connected, or today\'s steps', async () => {
    show()
    expect((await screen.findByTestId('glance-steps')).textContent).toContain('Not connected')
    expect(screen.getByTestId('glance-steps').textContent).toContain('Connect')
    await ldb.activity.add({ personId: 'p1', kind: 'steps', minutes: null, steps: 4321, startedAt: new Date().toISOString() } as never)
    await waitFor(() => expect(screen.getByTestId('glance-steps').textContent).toContain('4,321'))
    expect(screen.getByTestId('glance-steps').getAttribute('href')).toBe('#health/metric/steps')
  })
  it('Next visit: Not booked with the questions ready', async () => {
    await db.kv.put({ key: 'visits.questions.p1', value: ['Is Metformin still needed?'] })
    show()
    const t = await screen.findByTestId('glance-visit')
    expect(t.textContent).toContain('Not booked')
    await waitFor(() => expect(t.textContent).toContain('1 question ready'))
  })
  it('Steps from 2 days ago say the day, never 0 today', async () => {
    show()
    await ldb.activity.add({ personId: 'p1', kind: 'steps', minutes: null, steps: 4200, startedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() } as never)
    await waitFor(() => expect(screen.getByTestId('glance-steps').textContent).toMatch(/4,200on (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/))
  })
  it('pins kv [bp, sugar] draws two tiles; Edit opens the Pinned sheet', async () => {
    await db.kv.put({ key: 'health.pins', value: ['bp_systolic', 'fasting_glucose'] })
    show()
    await waitFor(() => expect(screen.getByTestId('pinned').children.length).toBe(2))
    expect(screen.getByTestId('glance-fasting_glucose')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Pinned' })).toBeTruthy()
  })
})
