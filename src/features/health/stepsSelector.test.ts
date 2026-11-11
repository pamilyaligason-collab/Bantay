import { describe, expect, it } from 'vitest'
import { activitySeries, bodyNodes, stepDayTotals } from './model'
import { latestSteps } from './stepsDay'
import { stepDays } from './detail/activityLogic'
import { todayTiles } from './todayLogic'

// S30 live data: 2026-10-26 had 678 step rows totalling 69,018. The rows are many short spans, and pairs of them overlap (two apps writing one walk).
// Values below are hand-computed from the rule in model.ts: per source, a row adds only the part of its span not already covered; the day takes the best source.
const at = (h: number, mi = 0, d = 10) => new Date(2026, 10, d, h, mi).toISOString() // local 2026-11-dd
const row = (startedAt: string, steps: number | null, minutes: number | null, source = 'health-connect') => ({ kind: 'steps', steps, minutes, startedAt, source })
const NOW = new Date(2026, 10, 10, 20, 0)
const DAY = '2026-11-10'

describe('stepDayTotals: overlapping step rows count once', () => {
  it('two identical rows (one walk written twice) count once', () => {
    expect(stepDayTotals([row(at(10), 300, 5), row(at(10), 300, 5)]).get(DAY)).toBe(300)
  })
  it('a half overlapping pair adds the new half only: 1000 + (1000 x 5/10) = 1500', () => {
    expect(stepDayTotals([row(at(10, 0), 1000, 10), row(at(10, 5), 1000, 10)]).get(DAY)).toBe(1500)
  })
  it('a row inside a longer row adds nothing', () => {
    expect(stepDayTotals([row(at(10, 0), 1000, 60), row(at(10, 20), 400, 10)]).get(DAY)).toBe(1000)
  })
  it('back to back rows all count', () => {
    expect(stepDayTotals([row(at(10, 0), 500, 30), row(at(10, 30), 600, 30)]).get(DAY)).toBe(1100)
  })
  it('many short rows with overlapping pairs: 60 back-to-back minutes of 50 steps and 30 exact repeats of every other minute = 3,000', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(at(6, i), 50, 1))
    for (let i = 0; i < 60; i += 2) rows.push(row(at(6, i), 50, 1))
    expect(rows).toHaveLength(90)
    expect(stepDayTotals(rows).get(DAY)).toBe(3000)
  })
  it('a repeat that sticks out past the covered span adds the part that sticks out: 50 per minute x 1 min', () => {
    expect(stepDayTotals([row(at(6, 0), 100, 2), row(at(6, 1), 100, 2)]).get(DAY)).toBe(150) // 100 + 100 x 1/2
  })
  it('two sources for one walk take the best source, not the sum', () => {
    expect(stepDayTotals([row(at(8), 3000, 60, 'health-connect'), row(at(8), 2500, 60, 'healthkit')]).get(DAY)).toBe(3000)
  })
  it('a manual entry on a day with no sensor data counts; beside a sensor day it adds (typed steps are deliberate, Lloyd 2026-11-11)', () => {
    expect(stepDayTotals([row(at(9), 2000, null, 'manual')]).get(DAY)).toBe(2000)
    expect(stepDayTotals([row(at(9), 2000, null, 'manual'), row(at(10), 5000, 60)]).get(DAY)).toBe(7000)
  })
  it('zero-length rows: an exact repeat counts once, different times both count', () => {
    expect(stepDayTotals([row(at(9), 700, null), row(at(9), 700, null), row(at(11), 300, null)]).get(DAY)).toBe(1000)
  })
  it('a zero-length row inside a span already counted adds nothing; a standalone one (manual entry) counts (S30 live: 1,217 steps double counted)', () => {
    expect(stepDayTotals([row(at(10, 0), 1000, 10), row(at(10, 5), 400, null), row(at(10, 5), 400, 0)]).get(DAY)).toBe(1000)
    expect(stepDayTotals([row(at(10, 0), 1000, 10), row(at(10, 10), 400, null), row(at(12), 250, 0)]).get(DAY)).toBe(1650) // at the end of a span is not inside it
  })
  it('days stay apart; 0 steps is true data; null steps and negative rows are no data; a day with no rows has no entry', () => {
    const t = stepDayTotals([row(at(9, 0, 9), 100, 5), row(at(9, 0, 10), 0, 5), row(at(10, 0, 11), null, 5), row(at(10, 0, 12), -5, 5)])
    expect(t.get('2026-11-09')).toBe(100)
    expect(t.get(DAY)).toBe(0)
    expect(t.has('2026-11-11')).toBe(false)
    expect(t.has('2026-11-12')).toBe(false)
  })
  it('a row starting at 23:30 and one at 00:30 are two days (local day of the start)', () => {
    const t = stepDayTotals([row(at(23, 30, 9), 400, 20), row(at(0, 30, 10), 250, 20)])
    expect(t.get('2026-11-09')).toBe(400)
    expect(t.get(DAY)).toBe(250)
  })
})

describe('every steps surface reads the one selector', () => {
  // overlapping pair: 1,000 for 10 min and 1,000 starting 5 min later = 1,500 on the day
  const acts = [row(at(10, 0), 1000, 10), row(at(10, 5), 1000, 10)]
  it('Today/Health tile (bodyNodes) shows 1,500, not 2,000', () => {
    expect(bodyNodes([], acts, NOW).find((n) => n.id === 'steps')!.value).toBe('1,500')
  })
  it('the Today row tile and its ring', () => {
    const t = todayTiles({ personId: 'p', readings: [], activity: acts, doses: null, water: [], goalMl: null, now: NOW }).find((x) => x.code === 'steps')!
    expect(t.value).toBe('1,500')
    expect(t.empty).toBe(false)
  })
  it('the Move screen figure, the detail page days and the chart point', () => {
    expect(latestSteps(acts, NOW)).toMatchObject({ total: 1500, today: true })
    expect(stepDays(acts).get(DAY)).toBe(1500)
    expect(activitySeries(acts, 'steps')).toEqual([{ takenAt: `${DAY}T12:00:00.000Z`, value: 1500 }])
  })
  it('no steps rows: the tile is empty, never 0', () => {
    expect(bodyNodes([], [], NOW).find((n) => n.id === 'steps')!.empty).toBe(true)
    expect(latestSteps([], NOW)).toBeNull()
  })
})
