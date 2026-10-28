import { beforeEach, describe, expect, it } from 'vitest'
import { isSnoozed, snoozeCard, snoozedUntil, SNOOZE_KEY } from './snoozeCard'

const at = (h: number, m: number, d = 28) => new Date(2026, 9, d, h, m)
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
