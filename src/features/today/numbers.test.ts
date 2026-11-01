import { describe, expect, it } from 'vitest'
import type { Reading } from '../health/ranges'
import { numberTiles } from './numbers'
const now = new Date(2026, 9, 31)
const r = (test: string, value: number, d: Date, extra: Partial<Reading> = {}): Reading => ({ personId: 'me', test, value, unit: 'x', takenAt: d.toISOString(), ...extra })
describe('numberTiles', () => {
  it('no readings: three honest empty tiles', () => {
    const t = numberTiles([], now)
    expect(t.map((x) => [x.kicker, x.value, x.action])).toEqual([['Blood pressure', '--/--', 'Log now'], ['Sugar', '--', 'Log now'], ['Lab results', '--', 'Add a lab paper']])
  })
  it('latest BP pair and sugar; an out-of-range lab is red', () => {
    const t = numberTiles([r('bp_systolic', 128, new Date(2026, 9, 29)), r('bp_diastolic', 82, new Date(2026, 9, 29)), r('fasting_glucose', 96, new Date(2026, 9, 6)), r('alt', 115, new Date(2026, 9, 6), { labHigh: 55 })], now)
    expect(t[0]).toMatchObject({ value: '128/82', tint: 'blue' })
    expect(t[1]!.value).toBe('96')
    expect(t[2]).toMatchObject({ value: '115', tint: 'red', href: '#health/labs' })
  })
})
