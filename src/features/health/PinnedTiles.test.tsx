import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { NUDGE_PLAY_MS, NUDGE_SETTLE_MS, resetNudges } from '../nudge/nudgeDue'
import { doseSummary, PinnedTiles } from './PinnedTiles'
import type { Reading } from './ranges'
import { vdb } from './visitsStore'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const bp = (sys: number, dia: number, ago: number): Reading[] => [
  { personId: 'p1', test: 'bp_systolic', value: sys, unit: 'mmHg', takenAt: day(ago) },
  { personId: 'p1', test: 'bp_diastolic', value: dia, unit: 'mmHg', takenAt: day(ago) }
]
const show = (readings: Reading[] = [], canLog = true) => render(<PinnedTiles personId="p1" readings={readings} canLog={canLog} />)

beforeEach(async () => {
  await Promise.all([db.kv.clear(), ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), vdb.appointments.clear(), vdb.followUps.clear()])
})
afterEach(() => { cleanup(); resetNudges() })

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
    await waitFor(() => expect(screen.getByTestId('glance-meds').textContent).toContain('8 AM'))
    expect(screen.getByTestId('glance-meds').textContent).toContain('Next dose · 0 of 2 taken')
  })
  it('Steps: Not connected, or today\'s steps', async () => {
    show()
    expect((await screen.findByTestId('glance-steps')).textContent).toContain('Not connected')
    expect(screen.getByTestId('glance-steps').textContent).toContain('Connect')
    await ldb.activity.add({ personId: 'p1', kind: 'steps', minutes: null, steps: 4321, startedAt: new Date().toISOString() } as never)
    await waitFor(() => expect(screen.getByTestId('glance-steps').textContent).toContain('4,321'))
    expect(screen.getByTestId('glance-steps').getAttribute('href')).toBe('#health/metric/steps')
  })
  it('Steps: switched on for this person but no rows yet says No steps yet with Open; another person\'s switch keeps Connect', async () => {
    await db.kv.put({ key: 'sensors.state', value: { enabled: ['steps'], cursor: {}, owner: 'p1' } })
    show()
    await waitFor(() => expect(screen.getByTestId('glance-steps').textContent).toContain('No steps yet'))
    expect(screen.getByTestId('glance-steps').textContent).not.toContain('Not connected')
    expect(screen.getByTestId('glance-steps').getAttribute('href')).toBe('#health/metric/steps')
    cleanup()
    await db.kv.put({ key: 'sensors.state', value: { enabled: ['steps'], cursor: {}, owner: 'p2' } })
    show()
    await screen.findByTestId('glance-steps')
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByTestId('glance-steps').textContent).toContain('Not connected')
    expect(screen.getByTestId('glance-steps').getAttribute('href')).toBe('#me/phone')
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
  it('a stored list of 7 shows the first four in a grid and does not crash', async () => {
    await db.kv.put({ key: 'health.pins', value: ['bp_systolic', 'fasting_glucose', 'heart_rate', 'weight', 'steps', 'meds', 'visits'] })
    show()
    await waitFor(() => expect(screen.getByTestId('pinned').children.length).toBe(4))
    expect(screen.getByTestId('pinned').className).toContain('pt-grid')
    expect(screen.queryByTestId('glance-steps')).toBeNull()
  })
  it('a stored list in a different order than the catalogue keeps its order: the first four as stored', async () => {
    await db.kv.put({ key: 'health.pins', value: ['visits', 'steps', 'meds', 'bp_systolic', 'weight', 'heart_rate'] })
    show()
    await waitFor(() => expect(screen.getByTestId('pinned').children.length).toBe(4))
    expect(Array.from(screen.getByTestId('pinned').querySelectorAll('[data-testid^="glance-"]')).map((e) => e.getAttribute('data-testid'))).toEqual(['glance-visit', 'glance-steps', 'glance-meds', 'glance-progress'])
    expect(screen.queryByTestId('glance-weight')).toBeNull()
  })
  it('Edit: a fifth pick is refused with a plain sentence, and unticking one makes room', async () => {
    show()
    await screen.findByTestId('glance-steps')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('pin-limit').textContent).toContain('4 of 4')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pulse' }))
    expect(screen.getByRole('alert').textContent).toContain('Four is the most')
    expect(screen.getByRole('checkbox', { name: 'Pulse' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Steps' }))
    await waitFor(() => expect(screen.getByTestId('pinned').children.length).toBe(3))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pulse' }))
    await waitFor(() => expect(screen.getByTestId('pinned').children.length).toBe(4))
    expect(screen.getByTestId('glance-heart_rate')).toBeTruthy()
  })
})

describe('D-125 nudges on Pinned', () => {
  const pinned = (...codes: string[]) => db.kv.put({ key: 'health.pins', value: codes })
  const pill = (id: string) => screen.getByTestId(id).querySelector('.nd-due')?.textContent ?? null
  const old = (test: string, value: number, ago: number): Reading => ({ personId: 'p1', test, value, unit: 'x', takenAt: day(ago) })
  const movers = () => Array.from(document.querySelectorAll('[data-nudge="move"]')).map((e) => e.getAttribute('data-testid'))
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, NUDGE_SETTLE_MS + 100)) }) // real clock: the hook's timer starts when the tile renders
  it('blood pressure with none this week shows a still Due pill inside the tile, in its kicker', async () => {
    show()
    await screen.findByTestId('glance-progress')
    expect(pill('glance-progress')).toBe('Due')
    expect(screen.getByTestId('glance-progress').querySelector('.pt-k')!.textContent).toBe('Blood pressureDue')
  })
  it('a reading this week clears it; medicines, steps and visits never show one', async () => {
    show(bp(124, 79, 1))
    await screen.findByTestId('glance-steps')
    for (const id of ['glance-progress', 'glance-meds', 'glance-steps', 'glance-visit']) expect(pill(id)).toBeNull()
  })
  it('a pinned sugar is Due only when it has an earlier reading and none this week', async () => {
    await pinned('fasting_glucose', 'heart_rate', 'weight', 'steps')
    show([old('fasting_glucose', 90, 12), old('heart_rate', 70, 2)])
    await screen.findByTestId('glance-fasting_glucose')
    expect(pill('glance-fasting_glucose')).toBe('Due') // earlier reading, none in 7 days
    expect(pill('glance-heart_rate')).toBeNull() // logged this week
    expect(pill('glance-weight')).toBeNull() // never logged
  })
  it('canLog false: no pill, no mover', async () => {
    show([], false)
    await screen.findByTestId('glance-progress')
    await settle()
    expect(document.querySelector('.nd-due')).toBeNull()
    expect(document.querySelector('[data-nudge]')).toBeNull()
  })
  it('one tile moves, blood pressure first, once per app open; the pill stays', async () => {
    await pinned('bp_systolic', 'weight', 'steps', 'meds')
    const { unmount } = show([old('weight', 80, 20)])
    await screen.findByTestId('glance-weight')
    await settle()
    expect(movers()).toEqual(['glance-progress'])
    expect(pill('glance-weight')).toBe('Due')
    await act(async () => { await new Promise((r) => setTimeout(r, NUDGE_PLAY_MS)) }) // the move has played out
    unmount()
    show([old('weight', 80, 20)])
    await screen.findByTestId('glance-weight')
    await settle()
    expect(movers()).toEqual([])
  })
  it('the priority is fixed, not the pin order: weight pinned first, both due, blood pressure still moves', async () => {
    await pinned('weight', 'bp_systolic', 'steps', 'meds')
    show([old('weight', 80, 20)])
    await screen.findByTestId('glance-weight')
    await settle()
    expect(pill('glance-weight')).toBe('Due')
    expect(pill('glance-progress')).toBe('Due')
    expect(movers()).toEqual(['glance-progress'])
  })
  it('with blood pressure clear, the due pinned metric moves', async () => {
    await pinned('bp_systolic', 'weight', 'steps', 'meds')
    show([...bp(120, 80, 1), old('weight', 80, 20)])
    await screen.findByTestId('glance-weight')
    await settle()
    expect(movers()).toEqual(['glance-weight'])
  })
})

describe('S24 inline row inside the Readings card: always two tiles', () => {
  const inline = (readings: Reading[] = []) => render(<PinnedTiles personId="p1" readings={readings} inline />)
  const ids = () => Array.from(screen.getByTestId('pinned').querySelectorAll('[data-testid^="glance-"]')).map((e) => e.getAttribute('data-testid'))
  const book = () => vdb.appointments.add({ clientId: 'a1', personId: 'p1', startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), provider: 'Dr. Reyes', purpose: 'Check-up' })
  const settled = () => waitFor(() => expect(screen.getByTestId('pinned').children.length).toBe(2))
  it('next visit booked, BP current: Next visit + Medicines', async () => {
    await book()
    inline(bp(120, 80, 1))
    await waitFor(() => expect(ids()).toEqual(['glance-visit', 'glance-meds']))
  })
  it('next visit booked, BP due: BP takes the Medicines place', async () => {
    await book()
    inline()
    await waitFor(() => expect(ids()).toEqual(['glance-visit', 'glance-progress']))
    expect(screen.getByTestId('glance-progress').querySelector('.nd-due')?.textContent).toBe('Due')
  })
  it('no next visit: Medicines + Move; with BP due, BP + Move; never one or three', async () => {
    inline(bp(120, 80, 1))
    await settled()
    expect(ids()).toEqual(['glance-meds', 'glance-steps'])
    cleanup()
    inline()
    await settled()
    expect(ids()).toEqual(['glance-progress', 'glance-steps'])
  })
  it('a booked visit never flashes the no-visit pair: the row is empty until the visits answer, then Next visit + Medicines', async () => {
    await book()
    inline(bp(120, 80, 1))
    const seen: (string | null)[][] = []
    const obs = new MutationObserver(() => seen.push(ids()))
    obs.observe(screen.getByTestId('pinned'), { childList: true, subtree: true })
    await waitFor(() => expect(ids()).toEqual(['glance-visit', 'glance-meds']))
    obs.disconnect()
    expect(seen.some((s) => s.includes('glance-steps'))).toBe(false)
  })
  it('the pins list does not change the inline row, and there is no Edit pins button', async () => {
    await db.kv.put({ key: 'health.pins', value: ['fasting_glucose', 'weight'] })
    await book()
    inline(bp(120, 80, 1))
    await waitFor(() => expect(ids()).toEqual(['glance-visit', 'glance-meds']))
    expect(screen.queryByRole('button', { name: 'Edit pins' })).toBeNull()
  })
  it('doseSummary: next pending dose time and the taken count, hand-computed', () => {
    const d = (at: number, state: 'taken' | 'skipped' | 'pending') => ({ at, state }) as never
    expect(doseSummary([])).toEqual({ value: 'Nothing due', sub: 'Today' })
    expect(doseSummary([d(480, 'taken'), d(1200, 'pending'), d(1290, 'pending')])).toEqual({ value: '8 PM', sub: 'Next dose · 1 of 3 taken' })
    expect(doseSummary([d(480, 'taken'), d(1215, 'skipped')])).toEqual({ value: 'All done', sub: '1 of 2 taken' })
    expect(doseSummary([d(0, 'pending')]).value).toBe('12 AM')
  })
})
