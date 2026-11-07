import { beforeEach, describe, expect, it } from 'vitest'
import { canSnooze, isSnoozed, snoozeCard, snoozeCount, snoozedUntil, SNOOZE_KEY, SNOOZE_MAX } from './snoozeCard'
const mnl = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(Date.UTC(y, mo, d, h - 8, mi, s)) // a fixed Manila instant, the same in every phone zone (ML-38)

const at = (h: number, m: number, d = 28) => mnl(2026, 9, d, h, m)
beforeEach(() => localStorage.clear())

describe('snoozeCard', () => {
  it('hides the card for 10 minutes, then it is back', () => {
    const t = at(9, 12)
    expect(isSnoozed('dose:me:540', t)).toBe(false)
    const until = snoozeCard('dose:me:540', 10, t)
    expect(until).toBe(at(9, 22).getTime())
    expect(isSnoozed('dose:me:540', at(9, 12))).toBe(true)
    expect(isSnoozed('dose:me:540', at(9, 21))).toBe(true)
    expect(isSnoozed('dose:me:540', at(9, 22))).toBe(false) // exactly at the time it returns
  })
  it('is per slot: another slot is not hidden', () => {
    snoozeCard('dose:me:540', 10, at(9, 12))
    expect(isSnoozed('dose:me:780', at(9, 13))).toBe(false)
  })
  it('survives a reload (read back from localStorage only)', () => {
    snoozeCard('dose:me:540', 10, at(9, 12))
    expect(JSON.parse(localStorage.getItem(SNOOZE_KEY)!)).toEqual({ '2026-10-28|dose:me:540': at(9, 22).getTime() })
    expect(isSnoozed('dose:me:540', at(9, 15))).toBe(true)
  })
  it('holds across midnight: set at 23:55 it is still hidden at 00:04 next day, back at 00:05', () => {
    snoozeCard('dose:me:1430', 10, at(23, 55))
    expect(isSnoozed('dose:me:1430', at(0, 4, 29))).toBe(true)
    expect(isSnoozed('dose:me:1430', at(0, 5, 29))).toBe(false)
  })
  it('23:30 and 00:30 both key on their own local day', () => {
    snoozeCard('s', 10, at(23, 30))
    expect(Object.keys(JSON.parse(localStorage.getItem(SNOOZE_KEY)!))).toEqual(['2026-10-28|s'])
    localStorage.clear()
    snoozeCard('s', 10, at(0, 30, 29))
    expect(Object.keys(JSON.parse(localStorage.getItem(SNOOZE_KEY)!))).toEqual(['2026-10-29|s'])
  })
  it('drops ended entries so the store does not grow; bad stored data reads as not snoozed', () => {
    snoozeCard('old', 10, at(8, 0))
    snoozeCard('new', 10, at(9, 12))
    expect(Object.keys(JSON.parse(localStorage.getItem(SNOOZE_KEY)!))).toEqual(['2026-10-28|new'])
    localStorage.setItem(SNOOZE_KEY, '{not json')
    expect(snoozedUntil('new', at(9, 13))).toBeNull()
    localStorage.setItem(SNOOZE_KEY, '[1,2]')
    expect(isSnoozed('new', at(9, 13))).toBe(false)
  })
})

describe('snooze cap (D-148)', () => {
  it('SNOOZE_MAX is 3: the 4th is not allowed, and the count is per slot', () => {
    expect(SNOOZE_MAX).toBe(3)
    for (let i = 0; i < 3; i++) {
      expect(canSnooze('dose:me:540', at(9, 12 + i))).toBe(true)
      snoozeCard('dose:me:540', 10, at(9, 12 + i))
    }
    expect(snoozeCount('dose:me:540', at(9, 20))).toBe(3)
    expect(canSnooze('dose:me:540', at(9, 20))).toBe(false)
    expect(canSnooze('dose:me:780', at(9, 20))).toBe(true)
  })
  it('a new Manila day starts again at 0 and drops counts older than yesterday', () => {
    for (let i = 0; i < 3; i++) snoozeCard('s', 10, at(23, i))
    expect(canSnooze('s', at(23, 30))).toBe(false)
    expect(canSnooze('s', at(0, 30, 29))).toBe(true)
    snoozeCard('s', 10, at(0, 30, 29))
    expect(Object.keys(JSON.parse(localStorage.getItem('td.snooze.n')!)).sort()).toEqual(['2026-10-28|s', '2026-10-29|s'])
    snoozeCard('s', 10, at(8, 0, 30))
    expect(Object.keys(JSON.parse(localStorage.getItem('td.snooze.n')!)).sort()).toEqual(['2026-10-29|s', '2026-10-30|s'])
  })
  it('the cap follows the dose\'s own day: a 23:30 dose snoozed 3 times across midnight cannot be snoozed a 4th time', () => {
    const day = '2026-10-28' // the dose day (doseDay), whatever the day of the tap
    snoozeCard('dose:me:1410', 10, at(23, 40), day)
    snoozeCard('dose:me:1410', 10, at(23, 55), day)
    snoozeCard('dose:me:1410', 10, at(0, 5, 29), day)
    expect(snoozeCount('dose:me:1410', at(0, 20, 29), day)).toBe(3)
    expect(canSnooze('dose:me:1410', at(0, 20, 29), day)).toBe(false)
    expect(canSnooze('dose:me:1410', at(0, 20, 29))).toBe(true) // keyed by the tap's own day it would look fresh: callers pass the dose day
  })
})
