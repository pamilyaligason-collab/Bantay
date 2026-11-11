import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayDoses } from '../health/GlanceGrid'
import { useWeekTakes } from '../health/MedDetail'
import { useToday } from '../health/Medicines'
import { useTakenToday } from '../health/useActivity'
import { ldb } from '../log/store'
import { usePersonZone } from './usePersonZone'
import { setPersonZones, setSelf, setZone } from './zone'

// S30 L9 (zone reactivity): people.tz arrives AFTER a screen has drawn. The hooks that ask zoneOf() must recompute, not keep the day they first read.
// Hand values (winter, Chicago UTC-6, Manila UTC+8): NOW = 2026-12-01T02:00Z = Manila Tue 12-01 10:00 = Chicago Mon 11-30 20:00.
// The dose row is taken at 2026-11-30T14:05Z = Chicago 11-30 08:05 = Manila 11-30 22:05, so it is "today" on the Chicago clock and "yesterday" on the Manila clock.
// The week row is taken at 2026-11-24T10:00Z: the Chicago 7-day window starts 11-24 06:00Z (inside), the Manila one 11-24 16:00Z (outside).
const CHI = 'America/Chicago'
const MNL = 'Asia/Manila'
const NOW = new Date('2026-12-01T02:00:00Z')
const MED = { personId: 'p1', name: 'Losartan', serverId: 'm-p1', clientId: 'c-p1', medStatus: 'active' as const, schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-11-01' }

beforeEach(async () => {
  await Promise.all([ldb.meds.clear(), ldb.medications.clear()])
  await ldb.medications.add(MED)
  await ldb.meds.add({ personId: 'p1', name: 'Losartan', medicationId: 'm-p1', slot: '08:00', takenAt: '2026-11-30T14:05:00Z' })
  await ldb.meds.add({ personId: 'p1', name: 'Week', takenAt: '2026-11-24T10:00:00Z' })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); setZone(null); setPersonZones({}, null); setSelf(null) })

// A: the viewer is in Manila, the person's zone is not known yet (Manila by default) and then arrives as Chicago.
// B: the viewer is in Chicago, the person was cached as Chicago and the server then says Manila.
const A = { name: 'viewer in Manila, person arrives in Chicago', start: () => { setZone(MNL); setSelf('me') }, arrive: () => setPersonZones({ p1: CHI }, 'me'), before: MNL, after: CHI }
const B = { name: 'viewer in Chicago, person arrives in Manila', start: () => { setZone(CHI); setSelf('me'); setPersonZones({ p1: CHI }, 'me') }, arrive: () => setPersonZones({ p1: MNL }, 'me'), before: CHI, after: MNL }
const takenSlot = (s: typeof A) => s.after === CHI // the dose row counts as taken only on the Chicago clock

describe.each([A, B])('$name', (s) => {
  beforeEach(() => s.start())

  it('usePersonZone follows the store', async () => {
    const { result } = renderHook(() => usePersonZone('p1'))
    expect(result.current).toBe(s.before)
    act(() => s.arrive())
    expect(result.current).toBe(s.after)
  })

  it('useTodayDoses (GlanceGrid) recomputes the person\'s day: taken on the Chicago clock, pending on the Manila one', async () => {
    const { result } = renderHook(() => useTodayDoses('p1'))
    const state = () => result.current?.doses[0]?.state
    await waitFor(() => expect(state()).toBe(takenSlot(s) ? 'pending' : 'taken'))
    act(() => s.arrive())
    await waitFor(() => expect(state()).toBe(takenSlot(s) ? 'taken' : 'pending'))
  })

  it('useToday (Medicines) moves the dose day and the matched doses', async () => {
    const { result } = renderHook(() => useToday('p1'))
    await waitFor(() => expect(result.current.day).toBe(s.before === CHI ? '2026-11-30' : '2026-12-01'))
    await waitFor(() => expect(result.current.doses[0]?.state).toBe(takenSlot(s) ? 'pending' : 'taken'))
    act(() => s.arrive())
    await waitFor(() => expect(result.current.day).toBe(s.after === CHI ? '2026-11-30' : '2026-12-01'))
    await waitFor(() => expect(result.current.doses[0]?.state).toBe(takenSlot(s) ? 'taken' : 'pending'))
  })

  it('useWeekTakes (MedDetail) re-reads from the new zone\'s window start', async () => {
    const { result } = renderHook(() => useWeekTakes('p1'))
    const weekRows = () => result.current?.filter((t) => t.name === 'Week').length
    await waitFor(() => expect(weekRows()).toBe(s.before === CHI ? 1 : 0))
    act(() => s.arrive())
    await waitFor(() => expect(weekRows()).toBe(s.after === CHI ? 1 : 0))
  })

  it('useTakenToday re-reads from the new zone\'s midnight', async () => {
    const { result } = renderHook(() => useTakenToday('p1'))
    const names = () => result.current.map((r) => r.name)
    await waitFor(() => expect(names()).toEqual(s.before === CHI ? ['Losartan'] : []))
    await act(async () => { await new Promise((r) => setTimeout(r, 80)) }) // let the first query answer, so a re-render from its answer cannot stand in for the zone change
    act(() => s.arrive())
    await waitFor(() => expect(names()).toEqual(s.after === CHI ? ['Losartan'] : []))
  })
})
