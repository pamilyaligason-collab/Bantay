import { describe, expect, it } from 'vitest'
import { dateKicker, greeting } from './greeting'
describe('greeting', () => {
  it('morning / afternoon / evening by phone hour', () => {
    expect(greeting(new Date(2026, 9, 31, 7), 'Rey')).toBe('Good morning, Rey')
    expect(greeting(new Date(2026, 9, 31, 13), 'rey')).toBe('Good afternoon, Rey')
    expect(greeting(new Date(2026, 9, 31, 19), '')).toBe('Good evening')
  })
  it('kicker is the Manila weekday and date', () => {
    expect(dateKicker(new Date('2026-10-31T12:00:00+08:00'))).toBe('Saturday, Oct 31')
  })
})
