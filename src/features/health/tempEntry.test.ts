import { describe, expect, it } from 'vitest'
import { cToF, fToC, parseTemp, tempAsk, tempBoth, tempUnitFor } from './tempEntry'

// Hand values: 98.6 F = (98.6-32)*5/9 = 37.0 C; 100.4 F = 38.0 C; 37.5 C = 99.5 F; 30 C = 86 F; 45 C = 113 F.
describe('body temperature entry', () => {
  it('Fahrenheit is converted to Celsius with one decimal, and both are shown', () => {
    expect(parseTemp('98.6', 'F')).toEqual({ c: 37, f: 98.6 })
    expect(parseTemp('100.4', 'F')).toEqual({ c: 38, f: 100.4 })
    expect(parseTemp('99,1', 'F')).toEqual({ c: 37.3, f: 99.1 }) // a comma is a decimal point; (99.1-32)*5/9 = 37.27
    expect(tempBoth(parseTemp('98.6', 'F')!)).toBe('37 °C (98.6 °F)')
  })
  it('a Celsius entry is stored exactly as typed', () => {
    expect(parseTemp('37.5', 'C')).toEqual({ c: 37.5, f: 99.5 })
    expect(parseTemp(' 36.85 ', 'C')!.c).toBe(36.85)
  })
  it('ranges are per unit: 30 to 45 C, 86 to 113 F, edges in, outside out, no value out', () => {
    expect(parseTemp('30', 'C')).toEqual({ c: 30, f: 86 })
    expect(parseTemp('45', 'C')).toEqual({ c: 45, f: 113 })
    expect(parseTemp('86', 'F')).toEqual({ c: 30, f: 86 })
    expect(parseTemp('113', 'F')).toEqual({ c: 45, f: 113 })
    expect(parseTemp('98.6', 'C')).toBeNull() // a Fahrenheit number in the Celsius box is refused, never guessed
    expect(parseTemp('37', 'F')).toBeNull()
    expect(parseTemp('85.9', 'F')).toBeNull()
    expect(parseTemp('113.1', 'F')).toBeNull()
    expect(parseTemp('', 'F')).toBeNull()
    expect(parseTemp('abc', 'C')).toBeNull()
  })
  it('helpers and wording', () => {
    expect(cToF(37)).toBe(98.6)
    expect(fToC(98.6)).toBe(37)
    expect(tempUnitFor('us')).toBe('F')
    expect(tempUnitFor('metric')).toBe('C')
    expect(tempAsk('F')).toBe('Type the temperature in °F, a number from 86 to 113.')
    expect(tempAsk('C')).toBe('Type the temperature in °C, a number from 30 to 45.')
  })
})
