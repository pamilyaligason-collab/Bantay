import 'fake-indexeddb/auto'
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ldb } from '../../log/store'
import { activitySeries } from '../model'
import { MetricChart } from '../MetricChart'
import { familyRows, monthVsYear, stepsSummary } from './activityLogic'
import { FamilyTable, FamilyToday, ActivityHero } from './ActivityDetail'
import { SleepHero } from './SleepDetail'
import { hm, lastNight, sleepBand, sleepSentence, yearBars } from './sleepLogic'
import { useNow } from './useNow'
import { YearBars } from './YearBars'

const PEOPLE = vi.hoisted(() => [{ id: 'me', name: 'Ana', isMe: true }, { id: 'a', name: 'Ben', isMe: false }])
vi.mock('../../family/roster', () => ({ useFamilyPeople: () => ({ people: PEOPLE, selfId: 'me' }) }))
vi.mock('../../family/useFamilyScope', () => ({ useLinkedPeople: () => PEOPLE }))

afterEach(() => { cleanup(); vi.useRealTimers() })
const NOW = new Date(2026, 10, 9, 10, 0) // local Mon 9 Nov 2026, 10:00
const at = (m: number, d: number, h: number, mi = 0) => new Date(2026, m, d, h, mi).toISOString()
// A watch / Health Connect row carries a real start; a QuickLog row ('manual') stores the moment it was logged.
const sleep = (startedAt: string, minutes: number, source = 'health-connect') => ({ kind: 'sleep', minutes, steps: null, startedAt, source })
const manual = (startedAt: string, minutes: number) => sleep(startedAt, minutes, 'manual')
const steps = (startedAt: string, n: number) => ({ kind: 'steps', minutes: null, steps: n, startedAt, source: 'manual' })

describe('sleep sentence', () => {
  it('under, within and over 7 to 9 hours for an adult aged 18 to 64', () => {
    for (const age of [18, 40, 64]) {
      expect(sleepSentence(4.3, age)).toBe('Shorter than the 7 to 9 hours recommended for adults.')
      expect(sleepSentence(7, age)).toBe('Within the 7 to 9 hours recommended for adults.')
      expect(sleepSentence(9, age)).toBe('Within the 7 to 9 hours recommended for adults.')
      expect(sleepSentence(9.5, age)).toBe('Longer than the 7 to 9 hours recommended for adults.')
    }
  })
  it('under, within and over 7 to 8 hours for 65 and older', () => {
    for (const age of [65, 70, 95]) {
      expect(sleepSentence(6.5, age)).toBe('Shorter than the 7 to 8 hours recommended for adults 65 and older.')
      expect(sleepSentence(7.5, age)).toBe('Within the 7 to 8 hours recommended for adults 65 and older.')
      expect(sleepSentence(8, age)).toBe('Within the 7 to 8 hours recommended for adults 65 and older.')
      expect(sleepSentence(8.75, age)).toBe('Longer than the 7 to 8 hours recommended for adults 65 and older.')
    }
  })
  it('says nothing for a child, an unknown age or no sleep', () => {
    expect(sleepSentence(5, 10)).toBeNull()
    expect(sleepSentence(5, 17)).toBeNull()
    expect(sleepSentence(5, null)).toBeNull()
    expect(sleepSentence(null, 40)).toBeNull()
    expect(sleepBand(12)).toBeNull()
    expect(sleepBand(null)).toBeNull()
    expect(sleepBand(18)).toEqual({ low: 7, high: 9, who: 'adults' })
    expect(sleepBand(64)).toEqual({ low: 7, high: 9, who: 'adults' })
    expect(sleepBand(65)).toEqual({ low: 7, high: 8, who: 'adults 65 and older' })
  })
})

describe('last night', () => {
  it('joins a 23:00 and a 01:54 start into one night, with a nap on the wake day and the earliest bed time', () => {
    const n = lastNight([sleep(at(10, 8, 23), 120), sleep(at(10, 9, 1, 54), 139), sleep(at(10, 9, 14), 60), sleep(at(10, 7, 23), 400)], NOW)!
    expect(n).toMatchObject({ day: '2026-11-09', minutes: 259, napMinutes: 60, bedAt: at(10, 8, 23) })
  })
  it('a daytime sleep is a nap only under 3 hours; a longer one is the main sleep (night worker)', () => {
    expect(lastNight([sleep(at(10, 9, 9, 30), 179)], NOW)).toBeNull()
    expect(lastNight([sleep(at(10, 9, 9, 30), 180)], NOW)).toMatchObject({ day: '2026-11-09', minutes: 180, napMinutes: 0 })
  })
  it('ignores other kinds, zero minutes and a night that ends tomorrow', () => {
    expect(lastNight([steps(at(10, 9, 1), 500), sleep(at(10, 9, 2), 0), sleep(at(10, 9, 23), 300)], NOW)).toBeNull()
  })
  it('a manual row never gives a bed time and counts for the night that ended on the day it was logged (07:30, 10:00)', () => {
    for (const [h, m] of [[7, 30], [10, 0]] as const) {
      expect(lastNight([manual(at(10, 9, h, m), 450)], NOW)).toMatchObject({ day: '2026-11-09', minutes: 450, napMinutes: 0, bedAt: null })
    }
  })
  it('a manual row logged at 23:30 the night before is the night that ended that day, so a sleep is still on file', () => {
    expect(lastNight([manual(at(10, 8, 23, 30), 420)], NOW)).toMatchObject({ day: '2026-11-08', minutes: 420, bedAt: null })
  })
  it('hero with only a manual row: hours shown, no "Went to sleep", never "No sleep recorded yet"', () => {
    for (const row of [manual(at(10, 9, 7, 30), 450), manual(at(10, 9, 10), 450), manual(at(10, 8, 23, 30), 450)]) {
      const { unmount } = render(<SleepHero acts={[row]} age={40} now={NOW} />)
      const t = screen.getByTestId('sleep-hero').textContent!
      expect(t).toContain('7 h 30 min')
      expect(t).not.toContain('Went to sleep')
      expect(t).not.toContain('No sleep recorded yet')
      unmount()
    }
  })
  it('a manual row beside a watch row adds minutes to the night and keeps the watch bed time', () => {
    expect(lastNight([sleep(at(10, 8, 23), 300), manual(at(10, 9, 8), 60)], NOW)).toMatchObject({ day: '2026-11-09', minutes: 360, bedAt: at(10, 8, 23) })
  })
  it('hero: hours, nap, bed time (watch row), sentence for an adult and none for a child', () => {
    const acts = [sleep(at(10, 9, 1, 54), 259), sleep(at(10, 9, 14), 60)]
    const { unmount } = render(<SleepHero acts={acts} age={40} now={NOW} />)
    const hero = screen.getByTestId('sleep-hero')
    expect(hero.textContent).toContain('4 h 19 min')
    expect(hero.textContent).toContain('plus 1 h 00 min nap')
    expect(hero.textContent).toContain('Went to sleep')
    expect(screen.getByTestId('sleep-sentence').textContent).toContain('Shorter than the 7 to 9 hours recommended for adults.')
    unmount()
    render(<SleepHero acts={acts} age={9} now={NOW} />)
    expect(screen.queryByTestId('sleep-sentence')).toBeNull()
  })
})

describe('nights are grouped by wake day everywhere', () => {
  it('a split night (23:00 + 01:54) is one bar of 4.3 h on the wake day; a manual row sits on its logged day', () => {
    const rows = [sleep(at(10, 8, 23), 120), sleep(at(10, 9, 1, 54), 139), manual(at(10, 7, 8), 480)]
    expect(activitySeries(rows, 'sleep')).toEqual([{ takenAt: '2026-11-07T12:00:00.000Z', value: 8 }, { takenAt: '2026-11-09T12:00:00.000Z', value: 4.3 }])
  })
  it('hero minutes, the bar and the sentence all read the same night', () => {
    const rows = [sleep(at(10, 8, 23), 120), sleep(at(10, 9, 1, 54), 139)]
    const bar = activitySeries(rows, 'sleep')
    expect(bar).toHaveLength(1)
    expect(bar[0]!.value).toBe(4.3)
    render(<SleepHero acts={rows} age={40} now={NOW} />)
    expect(screen.getByTestId('sleep-hero').textContent).toContain('4 h 19 min')
    expect(screen.getByTestId('sleep-sentence').textContent).toContain('Shorter than')
  })
})

describe('one clock for every figure', () => {
  it('the average label uses the hero formatter, visible and aria', () => {
    expect(hm(362)).toBe('6 h 02 min')
    const pts = [{ takenAt: '2026-11-07T12:00:00.000Z', value: 6 }, { takenAt: '2026-11-08T12:00:00.000Z', value: 6.1 }] // mean 6.05 h = 363 min
    const { container } = render(<MetricChart pts={pts} days={7} now={new Date('2026-11-09T12:00:00Z')} unit="hours" label="Sleep this week" />)
    expect(container.querySelector('[data-testid=metric-avg]')!.textContent).toBe('Avg this week 6 h 03 min')
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('average 6 h 03 min')
  })
  it('the year view says "last 12 months" and averages the days, matching its aria', () => {
    const p = [{ takenAt: at(10, 3, 12), value: 6 }, { takenAt: at(10, 4, 12), value: 6 }, { takenAt: at(8, 3, 12), value: 9 }] // daily mean 7 h; a mean of monthly means would be 7.5 h
    const { container } = render(<YearBars pts={p} now={NOW} unit="hours" label="Sleep, last 12 months" band={null} />)
    expect(screen.getByTestId('year-avg').textContent).toBe('Avg last 12 months 7 h 00 min')
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('average 7 h 00 min')
    expect(container.textContent).not.toContain('this year')
  })
  it('the average line is drawn only for sleep and steps', () => {
    const now = new Date('2026-11-09T12:00:00Z')
    const two = [{ takenAt: '2026-11-07T12:00:00.000Z', value: 5 }, { takenAt: '2026-11-08T12:00:00.000Z', value: 7 }]
    for (const [unit, line] of [['hours', 1], ['steps', 1], ['mmHg', 0], ['', 0], ['bpm', 0]] as const) {
      const { container, unmount } = render(<MetricChart pts={two} days={7} now={now} unit={unit} label="x" />)
      expect(container.querySelectorAll('[data-testid="avg-line"]')).toHaveLength(line)
      unmount()
    }
  })
})

describe('recommended band and average line', () => {
  const pts = [{ takenAt: '2026-11-07T12:00:00.000Z', value: 6 }, { takenAt: '2026-11-08T12:00:00.000Z', value: 8 }]
  const now = new Date('2026-11-09T12:00:00Z')
  it('week chart draws the dashed band for an adult and an average line; none for a child', () => {
    const { container, unmount } = render(<MetricChart pts={pts} days={7} now={now} unit="hours" label="Sleep this week" band={sleepBand(40)} />)
    expect(container.querySelectorAll('rect.mc-band')).toHaveLength(1)
    expect(container.querySelector('[data-testid="avg-line"]')).not.toBeNull()
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('normal 7 to 9')
    unmount()
    const c2 = render(<MetricChart pts={pts} days={7} now={now} unit="hours" label="Sleep this week" band={sleepBand(9)} />)
    expect(c2.container.querySelectorAll('rect.mc-band')).toHaveLength(0)
  })
  it('year view caption and aria say who the band is for', () => {
    const { container } = render(<YearBars pts={[{ takenAt: at(10, 3, 12), value: 6 }]} now={NOW} unit="hours" label="Sleep" band={sleepBand(70)} />)
    expect(container.textContent).toContain('Dashed band: 7 to 8 hours, recommended for adults 65 and older.')
  })
  it('year view: 12 slots, bars only for months with data, band, average line, axis from 0', () => {
    const p = [{ takenAt: at(10, 3, 12), value: 6 }, { takenAt: at(8, 3, 12), value: 8 }]
    expect(yearBars(p, NOW)).toHaveLength(12)
    expect(yearBars(p, NOW).filter((b) => b.avg != null).map((b) => [b.month, b.avg])).toEqual([['2026-09', 8], ['2026-11', 6]])
    const { container } = render(<YearBars pts={p} now={NOW} unit="hours" label="Sleep, last 12 months" band={{ low: 7, high: 9 }} />)
    expect(container.querySelectorAll('[data-testid="year-bar"]')).toHaveLength(2)
    expect(container.querySelectorAll('rect.mc-band')).toHaveLength(1)
    expect(container.querySelector('[data-testid="avg-line"]')).not.toBeNull()
    expect([...container.querySelectorAll('text.mc-t')].map((t) => t.textContent)).toContain('0')
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('average 7 h')
  })
})

describe('steps summary', () => {
  it('today, 30-day, month and year means over days with data; null with none', () => {
    const acts = [steps(at(10, 9, 8), 1000), steps(at(10, 9, 9), 500), steps(at(10, 8, 9), 3000), steps(at(0, 5, 9), 9000), steps(at(9, 20, 9), 5000)]
    expect(stepsSummary(acts, NOW)).toEqual({ today: 1500, avg30: 3167, month: 2250, year: 4625, monthDays: 2 }) // days: 1500, 3000, 5000 (30 d), 9000 -> year 18500 over 4
    expect(stepsSummary([], NOW)).toEqual({ today: null, avg30: null, month: null, year: null, monthDays: 0 })
  })
  it('month against year wording names its subject', () => {
    expect(monthVsYear(2740, 9544, 9)).toBe('This month: 2,740 steps a day, lower than your average this year (9,544).')
    expect(monthVsYear(12000, 9544, 9)).toBe('This month: 12,000 steps a day, higher than your average this year (9,544).')
    expect(monthVsYear(5410, 5415, 9)).toBe('This month: 5,410 steps a day, about the same as your average this year (5,415).')
    expect(monthVsYear(2740, 9544, 6)).toBeNull() // fewer than 7 days of data
    expect(monthVsYear(2740, 9544, 7)).not.toBeNull()
    expect(monthVsYear(null, 9544)).toBeNull()
  })
  it('hero says plainly when nothing was shared', () => {
    render(<ActivityHero acts={[]} now={NOW} />)
    expect(screen.getByTestId('activity-hero').textContent).toContain('No steps shared today yet.')
    expect(screen.getByTestId('activity-hero').textContent).toContain('No 30-day average yet.')
  })
})

describe('family today permission filter', () => {
  const everyone = [{ id: 'me', name: 'Ana', isMe: true }, { id: 'a', name: 'Ben', isMe: false }, { id: 'x', name: 'Zed', isMe: false }]
  it('a member you may not see never gets a row, even with steps on this phone', () => {
    const rows = familyRows(everyone, new Set(['me', 'a']), { me: 4000, a: null, x: 99999 })
    expect(rows.map((r) => r.id)).toEqual(['me', 'a'])
    render(<FamilyTable rows={rows} />)
    expect(screen.queryByText('Zed')).toBeNull()
    expect(document.body.textContent).not.toContain('99,999')
  })
  it('is a real table with column and row headers; no steps is said, not zero', () => {
    render(<FamilyTable rows={familyRows(everyone, new Set(['me', 'a']), { me: 4000 })} />)
    const t = screen.getByRole('table')
    expect(within(t).getAllByRole('columnheader').every((h) => h.getAttribute('scope') === 'col')).toBe(true)
    expect(within(t).getAllByRole('rowheader').map((h) => [h.textContent, h.getAttribute('scope')])).toEqual([['You', 'row'], ['Ben', 'row']])
    expect(within(t).getByText('4,000')).toBeTruthy()
    expect(within(t).getByText('No steps shared today')).toBeTruthy()
  })
})

describe('midnight: lastNight, stepsSummary, FamilyToday and the clock hook', () => {
  const D = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m)
  it('lastNight at 23:30 names the morning of the 9th; at 00:30 on the 10th a night that began 23:45 is the 10th', () => {
    const rows = [sleep(at(10, 8, 23), 400), manual(at(10, 9, 7), 30)]
    expect(lastNight(rows, D(9, 23, 30))).toMatchObject({ day: '2026-11-09', minutes: 430 })
    const later = [...rows, sleep(at(10, 9, 23, 45), 60)] // a watch row begun 23:45 on the 9th ends on the 10th
    expect(lastNight(later, D(9, 23, 30))).toMatchObject({ day: '2026-11-09' })
    expect(lastNight(later, D(10, 0, 30))).toMatchObject({ day: '2026-11-10', minutes: 60, bedAt: at(10, 9, 23, 45) })
  })
  it('stepsSummary at 23:30 and 00:30: today, month and year move with the local day', () => {
    const acts = [steps(at(10, 9, 9), 4000), steps(at(10, 10, 9), 6000)]
    expect(stepsSummary(acts, D(9, 23, 30))).toMatchObject({ today: 4000, month: 4000, year: 4000 })
    expect(stepsSummary(acts, D(10, 0, 30))).toMatchObject({ today: 6000, month: 5000, year: 5000, avg30: 5000 })
  })
  it('FamilyToday shows the 9th at 23:30 and the 10th at 00:30, never yesterday as today', async () => {
    await ldb.activity.clear()
    await ldb.activity.bulkAdd([
      { personId: 'me', kind: 'steps', minutes: null, steps: 4321, startedAt: at(10, 9, 9), source: 'manual' },
      { personId: 'a', kind: 'steps', minutes: null, steps: 1111, startedAt: at(10, 10, 0, 10), source: 'manual' }
    ])
    const { rerender } = render(<FamilyToday now={D(9, 23, 30)} />)
    await waitFor(() => expect(screen.getByTestId('family-today').textContent).toContain('4,321'))
    expect(screen.getByTestId('family-today').textContent).not.toContain('1,111')
    rerender(<FamilyToday now={D(10, 0, 30)} />)
    await waitFor(() => expect(screen.getByTestId('family-today').textContent).toContain('1,111'))
    expect(screen.getByTestId('family-today').textContent).not.toContain('4,321')
  })
  it('FamilyToday equals the tile for the same person and day: an overlapping pair is 1,500, not 2,000 (ML-51)', async () => {
    await ldb.activity.clear()
    await ldb.activity.bulkAdd([
      { personId: 'me', kind: 'steps', minutes: 10, steps: 1000, startedAt: at(10, 10, 9, 0), source: 'manual' },
      { personId: 'me', kind: 'steps', minutes: 10, steps: 1000, startedAt: at(10, 10, 9, 5), source: 'manual' }
    ])
    render(<FamilyToday now={D(10, 12, 0)} />)
    await waitFor(() => expect(screen.getByTestId('family-today').textContent).toContain('1,500'))
    expect(screen.getByTestId('family-today').textContent).not.toContain('2,000')
  })
  it('useNow ticks over at local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(D(9, 23, 30))
    const { result } = renderHook(() => useNow())
    expect(result.current.getDate()).toBe(9)
    act(() => { vi.advanceTimersByTime(31 * 60_000) })
    expect(result.current.getDate()).toBe(10)
  })
})

describe('yearBand (MetricScreen -> YearBars, S26 clinical S1)', () => {
  it('keeps the 65+ age group so the year caption names it', async () => {
    const { yearBand } = await import('../MetricScreen')
    expect(yearBand(sleepBand(70))).toEqual({ low: 7, high: 8, who: 'adults 65 and older' })
    expect(yearBand(sleepBand(40))).toEqual({ low: 7, high: 9, who: 'adults' })
    expect(yearBand(null)).toBeNull()
    const { container } = render(<YearBars pts={[]} now={NOW} unit="hours" label="Sleep" band={yearBand(sleepBand(70))} />)
    expect(container.textContent).toContain('recommended for adults 65 and older')
  })
})

