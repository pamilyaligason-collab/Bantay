import { describe, expect, it } from 'vitest'
import { chipTime, entrySpec, previewReading } from './readingPreview'

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
    expect(previewReading(bp, { top: '190', bottom: '110' }).line).toMatch(/get help now/)
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
