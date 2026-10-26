import { describe, expect, it } from 'vitest'
import { chipTime, crisisOf, entrySpec, previewReading } from './readingPreview'

const bp = entrySpec('bp_systolic')!
const sugar = entrySpec('fasting_glucose')!

describe('add reading preview', () => {
  it('only typed measures have a sheet', () => {
    expect(entrySpec('bp_diastolic')?.kind).toBe('bp')
    expect(entrySpec('steps')).toBeNull()
    expect(entrySpec('hba1c')).toBeNull()
  })
  it('blood pressure: colour state and a plain line', () => {
    expect(previewReading(bp, { top: '118', bottom: '76' })).toMatchObject({ state: 'within', word: 'In range' })
    expect(previewReading(bp, { top: '138', bottom: '86' })).toMatchObject({ state: 'above', word: 'High' })
    expect(previewReading(bp, { top: '124', bottom: '76' })).toMatchObject({ state: 'above', word: 'A little raised' })
    expect(previewReading(bp, { top: '85', bottom: '55' }).state).toBe('below')
    expect(previewReading(bp, { top: '190', bottom: '110' }).line).toMatch(/warning signs/)
    expect(previewReading(bp, { top: '134', bottom: '84' })).toMatchObject({ state: 'above', word: 'Above target' })
    expect(previewReading(bp, { top: '129', bottom: '79' })).toMatchObject({ state: 'above', word: 'A little raised' })
    expect(previewReading(bp, { top: '88', bottom: '58' })).toMatchObject({ state: 'below', word: 'Low' })
  })
  it('refuses nonsense instead of previewing it', () => {
    expect(previewReading(bp, { top: '', bottom: '80' }).state).toBe('invalid')
    expect(previewReading(bp, { top: '80', bottom: '120' }).state).toBe('invalid')
    expect(previewReading(bp, { top: '500', bottom: '80' }).state).toBe('invalid')
    expect(previewReading(sugar, { value: 'abc' }).state).toBe('invalid')
  })
  it('sugar: colour and text come from the one guide (70 to 99), 100 is a bit high, 65 is low', () => {
    expect(previewReading(sugar, { value: '99' }).state).toBe('within')
    expect(previewReading(sugar, { value: '100' })).toMatchObject({ state: 'above', word: 'A bit high' })
    expect(previewReading(sugar, { value: '65' })).toMatchObject({ state: 'below', word: 'Low' })
    expect(previewReading(sugar, { value: '92' }).line).toContain('70 to 99 mg/dL (3.9 to 5.5 mmol/L)')
  })
  it('single values use the usual range', () => {
    expect(previewReading(sugar, { value: '104' })).toMatchObject({ state: 'above' })
    expect(previewReading(sugar, { value: '92' }).state).toBe('within')
    expect(previewReading(entrySpec('heart_rate')!, { value: '72' }).state).toBe('within')
    expect(previewReading(entrySpec('weight')!, { value: '61.5' }).state).toBe('none')
  })
  it('time chips: this morning and evening, or yesterday when not yet', () => {
    const noon = new Date(2026, 9, 20, 12, 0)
    expect(chipTime('morning', noon).getHours()).toBe(7)
    expect(chipTime('morning', noon).getDate()).toBe(20)
    expect(chipTime('evening', noon).getDate()).toBe(19)
    expect(chipTime('now', noon).getTime()).toBe(noon.getTime())
  })
})

describe('crisis readings (the same lines as the 0035 family alert)', () => {
  it('blood pressure: top 180 or more OR bottom 120 or more, each on its own', () => {
    expect(crisisOf('bp', { top: 180, bottom: 90 })).toBe('bp')
    expect(crisisOf('bp', { top: 150, bottom: 120 })).toBe('bp')
    expect(crisisOf('bp', { top: 179, bottom: 119 })).toBeNull()
    expect(crisisOf('bp', { top: null, bottom: null })).toBeNull()
  })
  it('sugar: under 70 or over 300 mg/dL; mmol/L is multiplied by 18 first', () => {
    expect(crisisOf('fasting_glucose', { value: 69 })).toBe('low_sugar')
    expect(crisisOf('glucose', { value: 70 })).toBeNull()
    expect(crisisOf('glucose', { value: 300 })).toBeNull()
    expect(crisisOf('glucose', { value: 301 })).toBe('high_sugar')
    expect(crisisOf('glucose', { value: 3.0, unit: 'mmol/L' })).toBe('low_sugar') // 54 mg/dL
    expect(crisisOf('glucose', { value: 5.5, unit: 'mmol/L' })).toBeNull() // 99 mg/dL
  })
  it('oxygen under 90 only; steps and weight never', () => {
    expect(crisisOf('spo2', { value: 89 })).toBe('low_spo2')
    expect(crisisOf('spo2', { value: 90 })).toBeNull()
    expect(crisisOf('weight', { value: 5 })).toBeNull()
  })
  it('the preview of a crisis sugar says what to do, not only a colour', () => {
    expect(previewReading(sugar, { value: '60' })).toMatchObject({ state: 'below', word: 'Low' })
    expect(previewReading(sugar, { value: '60' }).line).toMatch(/15 g/)
    expect(previewReading(sugar, { value: '320' }).line).toMatch(/Very high/)
  })
})
