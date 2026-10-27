import { describe, expect, it } from 'vitest'
import { parseReading, replyValid } from './replyParse'

describe('parseReading', () => {
  it('reads a plain pair', () => expect(parseReading('128/82')).toEqual({ sys: 128, dia: 82 }))
  it('reads spaces around the slash and a pulse', () => expect(parseReading('128 / 82 pulse 70')).toEqual({ sys: 128, dia: 82, pulse: 70 }))
  it('reads other separators and a leading bp', () => {
    expect(parseReading('BP 135-85')).toEqual({ sys: 135, dia: 85 })
    expect(parseReading('130 over 80')).toEqual({ sys: 130, dia: 80 })
    expect(parseReading('my blood pressure is 118 76')).toEqual({ sys: 118, dia: 76 })
    expect(parseReading('128/82, 70 bpm')).toEqual({ sys: 128, dia: 82, pulse: 70 })
  })
  it('asks when only the top is given', () => {
    expect(parseReading('bp 128')).toEqual({ ask: 'over what?' })
    expect(parseReading('128')).toEqual({ ask: 'over what?' })
    expect(parseReading('bp 128 pulse 70')).toEqual({ ask: 'over what?' })
  })
  it('returns null for anything else', () => {
    for (const s of ['', '   ', 'ok', 'I feel fine', 'pulse 70', '12/8x', '1/2', '128/82/70', '128.5/82', 'x'.repeat(80)]) expect(parseReading(s), s).toBeNull()
  })
})

describe('replyValid', () => {
  it('accepts normal numbers', () => expect(replyValid({ sys: 128, dia: 82, pulse: 70 })).toBe(true))
  it('keeps the edges of the range', () => {
    expect(replyValid({ sys: 50, dia: 30 })).toBe(true)
    expect(replyValid({ sys: 300, dia: 200 })).toBe(true)
    expect(replyValid({ sys: 49, dia: 30 })).toBe(false)
    expect(replyValid({ sys: 301, dia: 100 })).toBe(false)
    expect(replyValid({ sys: 120, dia: 29 })).toBe(false)
    expect(replyValid({ sys: 250, dia: 201 })).toBe(false)
  })
  it('refuses a top that is not above the bottom, or a wild pulse', () => {
    expect(replyValid({ sys: 82, dia: 128 })).toBe(false)
    expect(replyValid({ sys: 90, dia: 90 })).toBe(false)
    expect(replyValid({ sys: 120, dia: 80, pulse: 251 })).toBe(false)
    expect(replyValid({ sys: 120, dia: 80, pulse: 19 })).toBe(false)
  })
})
