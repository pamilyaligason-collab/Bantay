import { describe, expect, it } from 'vitest'
import { averageNodes, avgLabel } from './vitals'

// Invented fixture shaped like what Health Connect gives: ~700 step samples a day, one per minute, all from one source.
// Rows are not counted twice: no two rows share an instant in this fixture.
// What was wrong: "7-day average" printed beside a figure from only 2 days with data (one big day, the next a small one).
const NOW = new Date(2026, 10, 1, 12, 0, 0)
interface Row { personId: string; kind: string; minutes: number | null; steps: number | null; startedAt: string; source: string }
function stepDay(y: number, m: number, d: number, count: number, total: number, source = 'health-connect'): Row[] {
  const base = new Date(y, m, d, 6, 0, 0).getTime()
  return Array.from({ length: count }, (_, i) => ({
    personId: 'p1', kind: 'steps', minutes: 1, steps: i < count - 1 ? Math.floor(total / count) : total - Math.floor(total / count) * (count - 1),
    startedAt: new Date(base + i * 60_000).toISOString(), source
  }))
}
const stepsNode = (acts: Row[]) => averageNodes([], acts, NOW).find((n) => n.id === 'steps')!
const sleepRow = (y: number, m: number, d: number, minutes: number): Row => ({ personId: 'p1', kind: 'sleep', minutes, steps: null, startedAt: new Date(y, m, d, 1, 0, 0).toISOString(), source: 'health-connect' })

describe('H2 the average says how many days it used', () => {
  it('labels: 7-day average only with 7 days', () => {
    expect(avgLabel(7)).toBe('7-day average')
    expect(avgLabel(2)).toBe('Average of 2 days')
    expect(avgLabel(1)).toBe('Average of 1 day')
  })
  it('two days with data (9,000 and 7,000): the average of those 2 days is 8,000, labelled "Average of 2 days"', () => {
    const n = stepsNode([...stepDay(2026, 9, 31, 700, 9000), ...stepDay(2026, 9, 30, 7, 7000)])
    expect(n.value).toBe('8,000')
    expect(n.when).toBe('Average of 2 days')
    expect(n.note).toBe('Average of 2 days')
  })
  it('a big day and a small day average over the 2 days with data', () => {
    const n = stepsNode([...stepDay(2026, 9, 31, 700, 30_000), ...stepDay(2026, 9, 30, 11, 2000)])
    expect(n.value).toBe('16,000') // (30000 + 2000) / 2
    expect(n.when).toBe('Average of 2 days')
  })
  it('seven days with data: "7-day average"', () => {
    const week = [0, 1, 2, 3, 4, 5, 6].flatMap((i) => stepDay(2026, 10, 1 - i, 1, 7000))
    const n = stepsNode(week)
    expect(n.value).toBe('7,000')
    expect(n.when).toBe('7-day average')
  })
  it('sleep: a night and a nap on one day are one day of data', () => {
    const n = averageNodes([], [sleepRow(2026, 9, 31, 450), { ...sleepRow(2026, 9, 31, 45), startedAt: new Date(2026, 9, 31, 14, 0, 0).toISOString() }], NOW).find((x) => x.id === 'sleep')!
    expect(n.value).toBe('8h 15') // 495 min
    expect(n.when).toBe('Average of 1 day')
  })
  it('no step rows: empty, never 0', () => {
    expect(stepsNode([])).toMatchObject({ value: '--', empty: true })
  })
})

describe('S7 averages are labelled and never read as the latest verdict', () => {
  const hr = (value: number, hoursAgo: number) => ({ personId: 'p1', test: 'heart_rate', value, unit: 'bpm', takenAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString() })
  it('latest 110 bpm (High), average 78 over 5 days (in range): "Average in range · latest High", labelled with its days', () => {
    const readings = [hr(110, 1), hr(70, 24), hr(70, 48), hr(70, 72), hr(70, 96)] // (110 + 4 x 70) / 5 = 78
    const n = averageNodes(readings, [], NOW).find((x) => x.id === 'pulse')!
    expect(n.value).toBe('78')
    expect(n.when).toBe('Average of 5 days')
    expect(n.sub).toBe('Average in range · latest High')
    expect(n.note).toBe('Average in range · latest High')
  })
  it('latest and average agree: just the word', () => {
    const nodes = averageNodes([hr(72, 1), hr(70, 24)], [], NOW)
    expect(nodes.find((x) => x.id === 'pulse')!.sub).toBe('In range')
    expect(nodes.find((x) => x.id === 'pulse')!.when).toBe('Average of 2 days')
  })
  it('mood is not an average: it keeps the latest with its today or date note, never "average"', () => {
    const mood = (d: number, h: number) => ({ personId: 'p1', kind: 'mood-good', minutes: null, steps: null, startedAt: new Date(2026, 10, d, h).toISOString(), source: 'manual' })
    const today = averageNodes([], [mood(1, 9)], NOW).find((x) => x.id === 'mood')!
    expect(today).toMatchObject({ value: 'Good', note: 'today', when: 'today', sub: '' })
    const earlier = averageNodes([], [mood(29, 9)], NOW).find((x) => x.id === 'mood')!
    expect(earlier.note).not.toMatch(/average/i)
    expect(earlier.when).toBe(earlier.note)
    expect(earlier.note).not.toBe('today')
  })
  it('no node outside mood says "7-day average" unless 7 days had data', () => {
    const nodes = averageNodes([hr(72, 1)], [...stepDay(2026, 10, 1, 1, 100)], NOW)
    for (const n of nodes.filter((x) => !x.empty && x.id !== 'mood')) expect(n.when).toBe('Average of 1 day')
  })
})
