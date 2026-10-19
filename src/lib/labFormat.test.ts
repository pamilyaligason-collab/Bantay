import { describe, expect, it } from 'vitest'
import { formatLabValue, formatNumber, labName, providerName } from './labFormat'

describe('formatLabValue', () => {
  it('rounds to at most 2 decimals and keeps integers', () => {
    expect(formatNumber(56.0715)).toBe('56.07')
    expect(formatNumber(8.13)).toBe('8.13')
    expect(formatNumber(124)).toBe('124')
    expect(formatNumber(98.6)).toBe('98.6')
  })
  it('keeps significant small values', () => {
    expect(formatNumber(0.7194432)).toBe('0.72')
    expect(formatNumber(0.72)).toBe('0.72')
    expect(formatNumber(0.004)).toBe('0.004')
  })
  it('unknown is empty, never 0', () => {
    expect(formatNumber(null)).toBe('')
    expect(formatNumber(NaN)).toBe('')
    expect(formatLabValue(undefined, 'mg/dL')).toBe('')
  })
  it('adds the unit only when there is one', () => {
    expect(formatLabValue(56.0715, 'kg')).toBe('56.07 kg')
    expect(formatLabValue(5, '')).toBe('5')
  })
})

describe('labName', () => {
  it('uppercases known acronyms and keeps the mixed-case ones', () => {
    const pairs = [['alt', 'ALT'], ['Ast', 'AST'], ['hdl', 'HDL'], ['LDL', 'LDL'], ['rbc', 'RBC'], ['Wbc', 'WBC'], ['tsh', 'TSH'], ['fbs', 'FBS'], ['bun', 'BUN'], ['egfr', 'eGFR'], ['hba1c', 'HbA1c']]
    for (const [i, o] of pairs) expect(labName(i)).toBe(o)
  })
  it('title-cases the rest', () => {
    expect(labName('total_cholesterol')).toBe('Total Cholesterol')
    expect(labName('creatinine')).toBe('Creatinine')
    expect(labName('hdl cholesterol')).toBe('HDL Cholesterol')
    expect(labName(null)).toBe('')
  })
})

describe('providerName', () => {
  it('title-cases ALL CAPS and leaves mixed case alone', () => {
    expect(providerName('DR. JUAN DELA CRUZ')).toBe('Dr. Juan Dela Cruz')
    expect(providerName('BOHOL DOCTORS HOSPITAL')).toBe('Bohol Doctors Hospital')
    expect(providerName('Dr Test')).toBe('Dr Test')
    expect(providerName(null)).toBe('')
  })
})
