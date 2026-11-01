import { describe, expect, it } from 'vitest'
import { bpRow, checkInRow, countLeft, waterRow } from './dayRows'
const now = new Date(2026, 9, 31, 18)
describe('myDay rows', () => {
  it('bp: none this week, then one this week', () => {
    expect(bpRow([], now)).toEqual({ title: 'Blood pressure', sub: 'Weekly · none this week', done: false, href: '#health/metric/bp_systolic' })
    const t = new Date(2026, 9, 27, 7).toISOString()
    expect(bpRow([{ test: 'bp_systolic', value: 128, takenAt: t }, { test: 'bp_diastolic', value: 82, takenAt: t }], now)).toMatchObject({ sub: 'Last 128/82 · Tue', done: true })
  })
  it('water: glasses today over the goal in glasses', () => {
    expect(waterRow([{ ml: 250, drunkAt: now.toISOString() }], 1500, now)).toEqual({ title: 'Water', sub: '1 of 6 glasses', done: false })
    expect(waterRow([], 2000, now).sub).toBe('0 of 8 glasses')
    expect(waterRow([{ ml: 1500, drunkAt: now.toISOString() }], 1500, now).done).toBe(true)
  })
  it('check-in is done only when one is today', () => {
    expect(checkInRow([{ kind: 'check-in', startedAt: now.toISOString() }], now).done).toBe(true)
    expect(checkInRow([{ kind: 'check-in', startedAt: new Date(2026, 9, 30, 9).toISOString() }], now).done).toBe(false)
  })
  it('check-in sub does not promise the family signed out', () => {
    expect(checkInRow([], now, true).sub).toBe('Lets the family know you are fine')
    expect(checkInRow([], now, false).sub).toBe('Sign in to let the family know')
  })
  it('countLeft wording', () => {
    expect(countLeft([{ done: false }, { done: true }, { done: false }])).toEqual({ left: 2, total: 3, title: '2 things left today' })
    expect(countLeft([{ done: true }]).title).toBe('All done for today')
    expect(countLeft([{ done: false }]).title).toBe('1 thing left today')
  })
})
