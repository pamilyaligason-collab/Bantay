import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { over, pair, parse, ratio, tokensOf } from '../look/contrastMath'
import css from './nudgeDue.css?raw'
import { bpDue, checkInDue, metricDue, NUDGE_PLAY_MS, NUDGE_SETTLE_MS, pickMover, resetNudges, useNudgeMover, waterDue } from './nudgeDue'

const DAY = 86_400_000
const at = (h: number, min = 0) => new Date(2026, 10, 5, h, min, 0, 0) // Thu 5 Nov 2026, local
const NOW = at(10)
const sys = (agoMs: number) => ({ test: 'bp_systolic', value: 120, takenAt: new Date(NOW.getTime() - agoMs).toISOString() })

describe('bpDue: no reading in 7 days (the My day row rule)', () => {
  it('none at all is due', () => expect(bpDue([], NOW)).toBe(true))
  it('a reading exactly 7 days old is not due, one millisecond older is', () => {
    expect(bpDue([sys(7 * DAY)], NOW)).toBe(false)
    expect(bpDue([sys(7 * DAY + 1)], NOW)).toBe(true)
  })
  it('a bottom number alone does not count', () => expect(bpDue([{ test: 'bp_diastolic', value: 80, takenAt: NOW.toISOString() }], NOW)).toBe(true))
})

describe('checkInDue: not done today', () => {
  const ci = (d: Date) => [{ kind: 'check-in', startedAt: d.toISOString() }]
  it('due with no check-in', () => expect(checkInDue([], NOW)).toBe(true))
  it('done at 00:00 today, due from yesterday 23:59', () => {
    expect(checkInDue(ci(at(0)), NOW)).toBe(false)
    expect(checkInDue(ci(new Date(2026, 10, 4, 23, 59)), NOW)).toBe(true)
  })
  it('another kind does not count', () => expect(checkInDue([{ kind: 'mood-low', startedAt: NOW.toISOString() }], NOW)).toBe(true))
  it('23:30 and 00:30 local: a 23:10 check-in is done at 23:30 and due again at 00:30 next day; a 00:10 one is done at 00:30', () => {
    expect(checkInDue(ci(at(23, 10)), at(23, 30))).toBe(false)
    expect(checkInDue(ci(at(23, 10)), new Date(2026, 10, 6, 0, 30))).toBe(true)
    expect(checkInDue(ci(new Date(2026, 10, 6, 0, 10)), new Date(2026, 10, 6, 0, 30))).toBe(false)
  })
})

describe('waterDue: from 2 PM, under half the goal', () => {
  const ml = (n: number, h = 9) => [{ drunkAt: at(h).toISOString(), ml: n }]
  it('not before 2 PM, due at 2:00 PM sharp', () => {
    expect(waterDue([], 1500, at(13, 59))).toBe(false)
    expect(waterDue([], 1500, at(14, 0))).toBe(true)
  })
  it('exactly half of 1500 is not due, one ml less is', () => {
    expect(waterDue(ml(750), 1500, at(15))).toBe(false)
    expect(waterDue(ml(749), 1500, at(15))).toBe(true)
  })
  it('23:30 counts the day so far; 00:30 is before 2 PM and never due', () => {
    expect(waterDue(ml(700, 9), 1500, at(23, 30))).toBe(true)
    expect(waterDue(ml(750, 9), 1500, at(23, 30))).toBe(false)
    expect(waterDue([], 1500, new Date(2026, 10, 6, 0, 30))).toBe(false)
  })
  it("yesterday's water does not count", () => expect(waterDue([{ drunkAt: new Date(2026, 10, 4, 20).toISOString(), ml: 1500 }], 1500, at(15))).toBe(true))
})

describe('metricDue: a pinned sugar, pulse or weight', () => {
  const r = (test: string, agoMs: number) => ({ test, takenAt: new Date(NOW.getTime() - agoMs).toISOString() })
  it('never logged is not due', () => expect(metricDue([], 'weight', NOW)).toBe(false))
  it('only an older reading is due', () => expect(metricDue([r('weight', 30 * DAY)], 'weight', NOW)).toBe(true))
  it('exactly 7 days old is not due, one millisecond older is', () => {
    expect(metricDue([r('weight', 7 * DAY)], 'weight', NOW)).toBe(false)
    expect(metricDue([r('weight', 7 * DAY + 1)], 'weight', NOW)).toBe(true)
  })
  it('a recent reading of another metric does not clear it', () => expect(metricDue([r('weight', 30 * DAY), r('heart_rate', DAY)], 'weight', NOW)).toBe(true))
})

describe('pickMover: priority order, quiet screens', () => {
  const order = (...d: boolean[]) => ['bp', 'checkin', 'water'].map((key, i) => ({ key, due: d[i]! }))
  it('the first due item wins', () => expect(pickMover(order(false, true, true), false)).toBe('checkin'))
  it('blood pressure beats everything', () => expect(pickMover(order(true, true, true), false)).toBe('bp'))
  it('nothing due, or a quiet screen, moves nothing', () => {
    expect(pickMover(order(false, false, false), false)).toBeNull()
    expect(pickMover(order(true, true, true), true)).toBeNull()
  })
})

describe('useNudgeMover: once per open, after the data settles', () => {
  beforeEach(() => { vi.useFakeTimers(); resetNudges() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  const settle = () => act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })

  it('moves nothing before the settle time, then the picked item', () => {
    const { result } = renderHook(() => useNudgeMover('today', 'bp'))
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS - 1) })
    expect(result.current).toBeNull()
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('bp')
  })
  it('an item that looks Due only while rows load never moves', () => {
    const { result, rerender } = renderHook(({ p }: { p: string | null }) => useNudgeMover('today', p), { initialProps: { p: 'bp' as string | null } })
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS - 100) })
    rerender({ p: null })
    settle()
    expect(result.current).toBeNull()
  })
  it('the same item does not move again in the same app open, a new mount included', () => {
    const first = renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    expect(first.result.current).toBe('bp')
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS) }) // the move has played out
    first.unmount()
    const again = renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    expect(again.result.current).toBeNull()
  })
  it('a screen that goes away before the move has played gives the claim back; one that stayed does not', () => {
    const early = renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    expect(early.result.current).toBe('bp')
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS - 100) })
    early.unmount()
    const again = renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    expect(again.result.current).toBe('bp')
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS + 100) })
    again.unmount()
    const third = renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    expect(third.result.current).toBeNull()
  })
  it('the same item on another screen is its own item', () => {
    renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    const health = renderHook(() => useNudgeMover('health', 'bp'))
    settle()
    expect(health.result.current).toBe('bp')
  })
  it('one mounted screen moves one item only, even when the pick changes later', () => {
    const { result, rerender } = renderHook(({ p }: { p: string }) => useNudgeMover('today', p), { initialProps: { p: 'bp' } })
    settle()
    rerender({ p: 'checkin' })
    settle()
    expect(result.current).toBe('bp')
  })
  it('prefers-reduced-motion: nothing moves', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { result } = renderHook(() => useNudgeMover('today', 'bp'))
    settle()
    expect(result.current).toBeNull()
  })
})

describe('useNudgeMover: the move ends', () => {
  beforeEach(() => { vi.useFakeTimers(); resetNudges() })
  afterEach(() => vi.useRealTimers())
  it('the state clears when the move ends (NUDGE_PLAY_MS is the animation length) and does not come back', () => {
    const { result, rerender } = renderHook(() => useNudgeMover('today', 'bp'))
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(result.current).toBe('bp')
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS - 1) })
    expect(result.current).toBe('bp')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBeNull()
    rerender()
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS * 3) })
    expect(result.current).toBeNull()
  })
  it('leaving the moment the move ends keeps the claim: the next mount does not replay', () => {
    const first = renderHook(() => useNudgeMover('today', 'bp'))
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS) })
    first.unmount()
    const again = renderHook(() => useNudgeMover('today', 'bp'))
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(again.result.current).toBeNull()
  })
})

describe('the Due pill and the animation sheet', () => {
  it('pill text is >= 4.5:1 on its own background in light and dark', () => {
    for (const theme of ['light', 'dark'] as const) {
      const t = tokensOf(theme)
      const bg = over([parse(t['--amber']!)[0], 0.22], parse(t['--card']!)[0]) // --warn-bg = color-mix(amber 22%, card)
      expect(ratio(parse(t['--warn']!)[0], bg), theme).toBeGreaterThanOrEqual(4.5)
      expect(pair(t, '--ink', '--card'), theme).toBeGreaterThanOrEqual(4.5)
    }
    expect(css).toMatch(/\.nd-due \{[^}]*background: var\(--warn-bg\); color: var\(--warn\)/)
  })
  it('every animation runs a fixed count (no infinite loop) and is switched off under prefers-reduced-motion', () => {
    expect(css).not.toMatch(/infinite/)
    const rm = css.slice(css.indexOf('prefers-reduced-motion'))
    for (const sel of ['.td-todo-ic::after', '.td-todo-ic > svg', '.td-todo-go:not(:disabled)', '.pt[data-nudge="move"]::after', '.pt[data-nudge="move"] .nd-ic', '.pt[data-nudge="move"] .pt-a']) expect(rm).toContain(sel)
    expect(rm).toContain('animation: none')
  })
})
