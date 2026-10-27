import { describe, expect, it } from 'vitest'
import { pickOfDay, pickView } from './pick'
import { SEASONS, seasonFor } from './season'
import { dayKey, triviaIndex } from '../play/score'
import { phFactOf } from '../facts/onThisDay'

const id = (d: Date) => seasonFor(d)?.id ?? null
// Local-time constructors (month is 1-based here): 23:30 and 00:30 straddle every boundary (ML-38).
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min)

describe('pickOfDay', () => {
  it('same day, same item; the local day key flips between 23:30 and 00:30', () => {
    expect(pickOfDay('2026-10-28')).toEqual(pickOfDay('2026-10-28'))
    expect(dayKey(at(10, 28, 23, 30))).toBe('2026-10-28')
    expect(dayKey(at(10, 29, 0, 30))).toBe('2026-10-29')
    expect(pickOfDay(dayKey(at(10, 28, 23, 30)))).toEqual(pickOfDay('2026-10-28'))
  })
  // Hand-computed: FNV-1a of the key mod the 76-item pool (20 recipes, 12 playable videos, 24 trivia, 20 facts, in that order).
  it('pins the pick for known days (hand-computed)', () => {
    expect(pickOfDay('2026-10-28')).toEqual({ kind: 'trivia', id: '16' }) // pool 44; Play asks 16 too: "The first jeepneys..."
    expect(pickView(pickOfDay('2026-10-28')).title).toBe('The first jeepneys were made from old what?')
    expect(pickOfDay('2026-10-27')).toEqual({ kind: 'fact', id: '13' }) // pool 57
    expect(pickView(pickOfDay('2026-10-27')).title).toBe('Taal Volcano sits on an island inside a lake in Batangas.')
    expect(pickOfDay('2026-10-22')).toEqual({ kind: 'recipe', id: 'pinakbet-light' }) // pool 2
    expect(pickOfDay('2026-10-24')).toEqual({ kind: 'video', id: 'b-uX6N4RZjg' }) // pool 24
  })
  it('a trivia or fact pick is the question and fact Play shows that day, and its link opens it directly', () => {
    for (let d = 1; d <= 31; d++) {
      const day = `2026-12-${String(d).padStart(2, '0')}`
      const p = pickOfDay(day)
      if (p.kind === 'trivia') { expect(Number(p.id)).toBe(triviaIndex(day, 24)); expect(pickView(p).href).toBe('#discover/play/trivia') }
      if (p.kind === 'fact') { expect(pickView(p).title).toBe(phFactOf(day)); expect(pickView(p).href).toBe('#discover/play/facts') }
    }
  })
  it('a month of days reaches several kinds and every pick resolves to a card', () => {
    const kinds = new Set<string>()
    for (let d = 1; d <= 31; d++) {
      const p = pickOfDay(`2026-12-${String(d).padStart(2, '0')}`)
      kinds.add(p.kind)
      const v = pickView(p)
      expect(v.title.length).toBeGreaterThan(3)
      expect(v.href).toMatch(/^(#discover\/|https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$)/)
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3)
  })
  it('only a video opens outside the app', () => {
    for (let d = 1; d <= 30; d++) { const v = pickView(pickOfDay(`2026-11-${String(d).padStart(2, '0')}`)); expect(v.external).toBe(v.href.startsWith('https://')) }
  })
})

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
