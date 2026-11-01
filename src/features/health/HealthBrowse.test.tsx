import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { HealthBrowse, moveLine } from './HealthBrowse'
import type { Reading } from './ranges'
import { vdb } from './visitsStore'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const show = (readings: Reading[] = []) => render(<HealthBrowse personId="p1" readings={readings} thresholds={[]} />)

beforeEach(async () => { await Promise.all([db.kv.clear(), ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), vdb.appointments.clear(), vdb.followUps.clear()]) })
afterEach(cleanup)

describe('Browse', () => {
  it('six rows in order with their doors; Body wiki has no value', () => {
    show()
    const ids = ['readings', 'labs', 'meds', 'visits', 'move', 'body']
    const hrefs = ids.map((k) => screen.getByTestId(`browse-${k}`).querySelector('a')!.getAttribute('href'))
    expect(hrefs).toEqual(['#health/readings', '#health/labs', '#health/meds', '#health/visits', '#health/move', '#health/body'])
    expect(screen.getByTestId('browse-body').querySelector('.rw-value')).toBeNull()
    expect(screen.getByTestId('browse')).toBeTruthy()
  })
  it('live values: readings, labs, medicines, visits, move', async () => {
    const readings: Reading[] = [
      { personId: 'p1', test: 'bp_systolic', value: 124, unit: 'mmHg', takenAt: day(1) },
      { personId: 'p1', test: 'bp_diastolic', value: 79, unit: 'mmHg', takenAt: day(1) },
      { personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: day(2), labLow: 0, labHigh: 130 }
    ]
    await db.kv.put({ key: 'visits.questions.p1', value: ['q'] })
    await ldb.medications.add({ personId: 'p1', name: 'Metformin', schedule: { v: 1, times: ['08:00', '20:00'] } } as never)
    await ldb.activity.add({ personId: 'p1', kind: 'walk', minutes: 12, steps: null, startedAt: new Date().toISOString() } as never)
    show(readings)
    const val = (k: string) => screen.getByTestId(`browse-${k}`).textContent
    expect(val('readings')).toContain('124/79')
    expect(val('labs')).toContain('1 to ask')
    await waitFor(() => expect(val('meds')).toContain('2 of 2 left today'))
    await waitFor(() => expect(val('visits')).toContain('1 to ask'))
    await waitFor(() => expect(val('move')).toContain('12 min this week'))
  })
  it('empty person reads honestly', async () => {
    show()
    expect(screen.getByTestId('browse-readings').textContent).toContain('None this week')
    expect(screen.getByTestId('browse-labs').textContent).toContain('No papers yet')
    await waitFor(() => expect(screen.getByTestId('browse-meds').textContent).toContain('No medicines yet'))
    expect(screen.getByTestId('browse-move').textContent).toContain('No walks yet')
  })
  it('moveLine counts only the last 7 days of walks', () => {
    const a = (kind: string, minutes: number, ago: number) => ({ kind, minutes, steps: null, startedAt: day(ago) })
    expect(moveLine([])).toBe('No walks yet')
    expect(moveLine([a('walk', 20, 1), a('walk', 10, 2), a('walk', 50, 9)])).toBe('30 min this week')
    expect(moveLine([a('walk', 50, 9)])).toBe('No walks yet')
  })
})
