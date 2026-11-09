import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MetricChart } from '../MetricChart'
import { familyRows, monthVsYear, stepsSummary } from './activityLogic'
import { FamilyTable, ActivityHero } from './ActivityDetail'
import { SleepHero } from './SleepDetail'
import { lastNight, sleepBand, sleepSentence, yearBars } from './sleepLogic'
import { YearBars } from './YearBars'

afterEach(cleanup)
const NOW = new Date(2026, 10, 9, 10, 0) // local Mon 9 Nov 2026, 10:00
const at = (m: number, d: number, h: number, mi = 0) => new Date(2026, m, d, h, mi).toISOString()
const sleep = (startedAt: string, minutes: number) => ({ kind: 'sleep', minutes, steps: null, startedAt })
const steps = (startedAt: string, n: number) => ({ kind: 'steps', minutes: null, steps: n, startedAt })

describe('sleep sentence', () => {
  it('under, within and over 7 to 9 hours for an adult', () => {
    expect(sleepSentence(4.3, 40)).toBe('Shorter than the 7 to 9 hours adults need.')
    expect(sleepSentence(7, 40)).toBe('Within the 7 to 9 hours adults need.')
    expect(sleepSentence(9, 40)).toBe('Within the 7 to 9 hours adults need.')
    expect(sleepSentence(9.5, 40)).toBe('Longer than the 7 to 9 hours adults need.')
  })
  it('says nothing for a child, an unknown age or no sleep', () => {
    expect(sleepSentence(5, 10)).toBeNull()
    expect(sleepSentence(5, 17)).toBeNull()
    expect(sleepSentence(5, null)).toBeNull()
    expect(sleepSentence(null, 40)).toBeNull()
    expect(sleepBand(12)).toBeNull()
    expect(sleepBand(null)).toBeNull()
    expect(sleepBand(18)).toEqual({ low: 7, high: 9 })
  })
})

describe('last night', () => {
  it('joins a 23:00 and a 01:54 start into one night, with a nap on the wake day and the earliest bed time', () => {
    const n = lastNight([sleep(at(10, 8, 23), 120), sleep(at(10, 9, 1, 54), 139), sleep(at(10, 9, 14), 60), sleep(at(10, 7, 23), 400)], NOW)!
    expect(n).toMatchObject({ day: '2026-11-09', minutes: 259, napMinutes: 60, bedAt: at(10, 8, 23) })
  })
  it('ignores other kinds, zero minutes and a night that ends tomorrow', () => {
    expect(lastNight([steps(at(10, 9, 1), 500), sleep(at(10, 9, 2), 0), sleep(at(10, 9, 23), 300)], NOW)).toBeNull()
  })
  it('hero: hours, nap, bed time, sentence for an adult and none for a child', () => {
    const acts = [sleep(at(10, 9, 1, 54), 259), sleep(at(10, 9, 14), 60)]
    const { unmount } = render(<SleepHero acts={acts} age={40} now={NOW} />)
    const hero = screen.getByTestId('sleep-hero')
    expect(hero.textContent).toContain('4 h 19 min')
    expect(hero.textContent).toContain('plus 1 h 00 min nap')
    expect(hero.textContent).toContain('Went to sleep')
    expect(screen.getByTestId('sleep-sentence').textContent).toContain('Shorter than the 7 to 9 hours adults need.')
    unmount()
    render(<SleepHero acts={acts} age={9} now={NOW} />)
    expect(screen.queryByTestId('sleep-sentence')).toBeNull()
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
  it('year view: 12 slots, bars only for months with data, band, average line, axis from 0', () => {
    const p = [{ takenAt: at(10, 3, 12), value: 6 }, { takenAt: at(8, 3, 12), value: 8 }]
    expect(yearBars(p, NOW)).toHaveLength(12)
    expect(yearBars(p, NOW).filter((b) => b.avg != null).map((b) => [b.month, b.avg])).toEqual([['2026-09', 8], ['2026-11', 6]])
    const { container } = render(<YearBars pts={p} now={NOW} unit="hours" label="Sleep this year" band={{ low: 7, high: 9 }} />)
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
    expect(stepsSummary(acts, NOW)).toEqual({ today: 1500, avg30: 3167, month: 2250, year: 4625 }) // days: 1500, 3000, 5000 (30 d), 9000 -> year 18500 over 4
    expect(stepsSummary([], NOW)).toEqual({ today: null, avg30: null, month: null, year: null })
  })
  it('month against year wording', () => {
    expect(monthVsYear(2740, 9544)).toBe('Down from 9,544 a day this year.')
    expect(monthVsYear(12000, 9544)).toBe('Up from 9,544 a day this year.')
    expect(monthVsYear(9600, 9544)).toBe('About the same as this year (9,544 a day).')
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
