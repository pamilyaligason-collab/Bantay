import { describe, expect, it } from 'vitest'
import { dateKicker, greeting } from './greeting'
describe('greeting', () => {
  it('morning / afternoon / evening by phone hour', () => {
    expect(greeting(new Date(2026, 9, 31, 7), 'Rey')).toBe('Good morning, Rey')
    expect(greeting(new Date(2026, 9, 31, 13), 'rey')).toBe('Good afternoon, Rey')
    expect(greeting(new Date(2026, 9, 31, 19), '')).toBe('Good evening')
  })
  it('kicker is the weekday and date on the phone zone (A4): 12:00 Manila Saturday is 23:00 Friday in Chicago', () => {
    expect(dateKicker(new Date('2026-10-31T12:00:00+08:00'), 'Asia/Manila')).toBe('Saturday, Oct 31')
    expect(dateKicker(new Date('2026-10-31T12:00:00+08:00'), 'America/Chicago')).toBe('Friday, Oct 30')
  })
})
