import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { pickNext, type DuePerson } from '../features/today/nextPick'

const h = vi.hoisted(() => ({ pick: null as unknown, review: 0, taken: [] as unknown[][] }))
const { stub } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }) }))
vi.mock('../features/today/useNext', () => ({ useNext: () => ({ item: h.pick, review: h.review }) }))
vi.mock('../features/today/useDueMeds', () => ({ markDue: async () => true, markTaken: async (...a: unknown[]) => { h.taken.push(a); return 1 } }))
vi.mock('../features/notify/AlertsBanner', () => stub('alerts'))
vi.mock('../features/today/AlertBand', () => stub('alertband'))
vi.mock('../features/notify/AlertCardToday', () => ({ AlertCardToday: () => null }))
vi.mock('../features/phonecheck/AlarmFixedToast', () => ({ AlarmFixedToast: () => null }))
vi.mock('../features/family/IncomingSos', () => ({ IncomingSos: () => null }))
vi.mock('../features/family/sosActive', () => ({ useSosActive: () => false }))
vi.mock('../features/safety/StormCard', () => ({ StormCard: () => null }))
vi.mock('../features/today/WeatherCard', () => stub('weather'))
vi.mock('../features/today/SeeWeek', () => stub('seeweek'))
vi.mock('../features/today/SelfCare', () => stub('selfcare'))
vi.mock('../features/today/NearbyList', () => stub('nearby'))
vi.mock('../features/today/PlanToday', () => stub('plan'))
vi.mock('../features/today/QuickLog', () => stub('quicklog'))
vi.mock('../features/today/WeekLine', () => stub('week'))
vi.mock('../features/update/PwaBanner', () => ({ PwaBanner: () => null }))
vi.mock('../features/update/UpdateCard', () => ({ UpdateCard: () => null }))
import Today from './Today'

const now = new Date(2026, 9, 19, 9)
const person = (id: string, name: string, at: number): DuePerson => ({ personId: id, name, isMe: false, at, rel: at, status: 'upcoming', slots: [{ name: 'Aspirin', slot: '08:00', at, medicationId: `m-${id}`, key: `m-${id}`, personId: id, dose: null }] })
const dose = (d: DuePerson) => pickNext({ due: [d], plan: null, storm: null }, now)
const plan = pickNext({ due: [], plan: { key: 'p1', kind: 'plan', kicker: 'Plan · today', title: 'Next: Pay bills', body: 'Due today', actions: [] }, storm: null }, now)
const calm = pickNext({ due: [], plan: null, storm: null }, now)

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

/** Take Ma's dose, let the live pick flip to `after` while the card is held, run the morph out, then check what Today shows. */
async function takeThenFlip(after: unknown) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  h.pick = dose(person('ma', 'Ma', 480))
  const { rerender } = render(<Today />)
  fireEvent.click(await screen.findByRole('button', { name: 'Taken' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Taken \d{1,2}:\d{2}/ })).toBeTruthy())
  h.pick = after // the data flips the moment the take is saved; the held card stays up
  rerender(<Today />)
  expect(screen.getByRole('heading', { name: 'Ma: Aspirin' })).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
}

describe('Today after the dose card is released', () => {
  it('a second due dose (another person) renders fresh: visible, Taken enabled, Skip back', async () => {
    await takeThenFlip(dose(person('pa', 'Pa', 540)))
    expect(screen.getByRole('heading', { name: 'Pa: Aspirin' })).toBeTruthy()
    expect(document.querySelector('.td-next.leaving')).toBeNull()
    expect((screen.getByRole('button', { name: 'Taken' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
  })
  it('a plan item renders fresh with its link', async () => {
    await takeThenFlip(plan)
    expect(document.querySelector('.td-next.leaving')).toBeNull()
    expect(screen.getByRole('link', { name: 'Open plan' })).toBeTruthy()
  })
  it('calm: no Next up card', async () => {
    await takeThenFlip(calm)
    expect(document.querySelector('.td-next')).toBeNull()
  })
  it('a partial take: same person and time, only the untaken medicine left, renders fresh with Taken enabled and Skip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const two = (names: string[]): DuePerson => ({ personId: 'ma', name: 'Ma', isMe: false, at: 480, rel: 480, status: 'upcoming', slots: names.map((n) => ({ name: n, slot: '08:00', at: 480, medicationId: `m-${n}`, key: `k-${n}`, personId: 'ma', dose: null })) })
    h.pick = dose(two(['Aspirin', 'Metformin']))
    const { rerender } = render(<Today />)
    fireEvent.click(await screen.findByRole('button', { name: 'Taken' })) // 2 due: opens the picker
    fireEvent.click(screen.getByRole('checkbox', { name: /Metformin/ })) // untick Metformin: only Aspirin is taken
    fireEvent.click(screen.getByRole('button', { name: 'Mark these taken' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Taken \d{1,2}:\d{2}/ })).toBeTruthy())
    expect(h.taken.at(-1)).toEqual(['ma', ['k-Aspirin']]) // only the ticked medicine is written
    h.pick = dose(two(['Metformin'])) // same key dose:ma:480, one slot left
    rerender(<Today />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(document.querySelector('.td-next.leaving')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ma: Metformin' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Taken' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy()
  })
})
