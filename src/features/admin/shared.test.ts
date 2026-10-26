import { describe, expect, it } from 'vitest'
import { dateTime, day, statusLabel } from './shared'

describe('admin shared formatters', () => {
  it('day is "17 Oct 2026" and unknown is a dash', () => {
    expect(day('2026-10-17T02:00:00Z')).toBe('17 Oct 2026')
    expect(day(null)).toBe('-')
    expect(day('nope')).toBe('-')
  })
  it('dateTime adds the year only when it differs from this year', () => {
    expect(dateTime('2001-03-04T00:12:00Z')).toContain('2001')
    expect(dateTime(new Date().toISOString())).not.toContain(String(new Date().getFullYear()))
    expect(dateTime(undefined)).toBe('-')
  })
  it('label maps raw words and tidies unknown ones', () => {
    expect(statusLabel('confirmed')).toBe('Confirmed')
    expect(statusLabel('insert')).toBe('Add')
    expect(statusLabel('needs_review')).toBe('Needs review')
    expect(statusLabel(null)).toBe('-')
  })
})
