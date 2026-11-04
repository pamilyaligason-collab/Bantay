import { describe, expect, it } from 'vitest'
import { heroRainLine } from './heroRain'

const day = (p: Record<number, number | null>) => Array.from({ length: 24 }, (_, h) => ({ time: `2026-11-02T${String(h).padStart(2, '0')}:00`, prob: h in p ? p[h]! : 0 }))
describe('heroRainLine', () => {
  it('55% at 7 PM reads "this evening"', () => expect(heroRainLine(day({ 19: 55 }), '2026-11-02T16:10')).toBe('Rain 55% this evening'))
  it('20% is no line', () => expect(heroRainLine(day({ 19: 20 }), '2026-11-02T16:10')).toBeNull())
  it('30% is the first line that shows', () => expect(heroRainLine(day({ 9: 30 }), '2026-11-02T06:00')).toBe('Rain 30% this morning'))
  it('names afternoon and tonight', () => {
    expect(heroRainLine(day({ 14: 70 }), '2026-11-02T08:00')).toBe('Rain 70% this afternoon')
    expect(heroRainLine(day({ 23: 40 }), '2026-11-02T08:00')).toBe('Rain 40% tonight')
  })
  it('ignores hours already past and tomorrow', () => {
    expect(heroRainLine(day({ 8: 90 }), '2026-11-02T12:00')).toBeNull()
    expect(heroRainLine([{ time: '2026-11-03T09:00', prob: 90 }], '2026-11-02T12:00')).toBeNull()
  })
  it('a null hour beside a 40% hour still gives the 40% line', () => expect(heroRainLine(day({ 18: null, 20: 40 }), '2026-11-02T16:00')).toBe('Rain 40% this evening'))
  it('unknown probability is not rain', () => expect(heroRainLine(day({ 19: null }), '2026-11-02T16:00')).toBeNull())
})
