import { describe, expect, it } from 'vitest'
import { batteryRow, extraLine } from './dayRows'

const at = (h: number, m = 0) => new Date(2026, 10, 6, h, m)
describe('batteryRow (My day extra)', () => {
  it('18:59 has no row, 19:00 has one', () => {
    expect(batteryRow({ level: 0.22, charging: false }, at(18, 59))).toBeNull()
    expect(batteryRow({ level: 0.22, charging: false }, at(19))).toEqual({ title: 'Charge your phone', sub: '22% · so the family can reach you tonight', done: false })
  })
  it('0.29 is low, 0.30 is not', () => {
    expect(batteryRow({ level: 0.29, charging: false }, at(20))?.sub).toBe('29% · so the family can reach you tonight')
    expect(batteryRow({ level: 0.3, charging: false }, at(20))).toBeNull()
  })
  it('charging makes it done; unknown level has no row', () => {
    expect(batteryRow({ level: 0.1, charging: true }, at(20))?.done).toBe(true)
    expect(batteryRow(null, at(20))).toBeNull()
  })
  it('the extras line names it when it has no time of its own', () => {
    expect(extraLine(1, { title: 'Charge your phone', time: '' })).toBe('1 extra left: Charge your phone')
    expect(extraLine(2, { title: 'Evening medicine', time: '8 PM' })).toBe('2 extras left: Evening medicine at 8 PM')
    expect(extraLine(1)).toBe('1 extra left')
  })
})
