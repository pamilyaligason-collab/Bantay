import { describe, expect, it } from 'vitest'
import { SEASONS, seasonFor } from './season'

const id = (d: Date) => seasonFor(d)?.id ?? null
// Local-time constructors (month is 1-based here): 23:30 and 00:30 straddle every boundary (ML-38).
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min)


describe('seasonFor', () => {
  it('hot season 15 Mar to 31 May, edges at 23:30 and 00:30', () => {
    expect(id(at(3, 14, 23, 30))).toBeNull()
    expect(id(at(3, 15, 0, 30))).toBe('heat')
    expect(id(at(5, 31, 23, 30))).toBe('heat')
    expect(id(at(6, 1, 0, 30))).toBe('typhoon')
  })
  it('rainy season runs to 30 Nov, with Undas winning 25 Oct to 3 Nov', () => {
    expect(id(at(10, 24, 23, 30))).toBe('typhoon')
    expect(id(at(10, 25, 0, 30))).toBe('undas')
    expect(id(at(11, 3, 23, 30))).toBe('undas')
    expect(id(at(11, 4, 0, 30))).toBe('typhoon')
    expect(id(at(11, 30, 23, 30))).toBe('typhoon')
    expect(id(at(12, 1, 0, 30))).toBe('christmas')
  })
  it('Christmas food 1 Dec to 6 Jan wraps the year; New Year fireworks 26 Dec to 2 Jan wins inside it', () => {
    expect(id(at(12, 25, 23, 30))).toBe('christmas')
    expect(id(at(12, 26, 0, 30))).toBe('newyear')
    expect(id(at(12, 31, 12))).toBe('newyear')
    expect(id(at(1, 2, 23, 30))).toBe('newyear')
    expect(id(at(1, 3, 0, 30))).toBe('christmas')
    expect(id(at(1, 6, 23, 30))).toBe('christmas')
    expect(id(at(1, 7, 0, 30))).toBeNull()
  })
  it('nothing from 7 Jan to 14 Mar', () => {
    expect(id(at(2, 14))).toBeNull()
    expect(id(at(3, 14))).toBeNull()
  })
  it('every season has 2 or 3 lines and a sourced link', () => {
    for (const s of SEASONS) { expect(s.lines.length).toBeGreaterThanOrEqual(2); expect(s.lines.length).toBeLessThanOrEqual(3); expect(s.source.url).toMatch(/^https:\/\//); expect(s.link.href).toMatch(/^#/) }
  })
})
