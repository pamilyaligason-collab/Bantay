import { describe, expect, it } from 'vitest'
import type { Medication } from '../log/store'
import { amountIn, SUPPLEMENTS, supplementItems, supplementKind, supplementTotals } from './supplements'

const med = (o: Partial<Medication>): Medication => ({ personId: 'p', name: 'x', serverId: o.name ?? 'x', ...o })
const kind = (id: string) => SUPPLEMENTS.find((s) => s.id === id)!

describe('supplement list from the medicine list', () => {
  it('matches by name or generic name and leaves real medicines alone', () => {
    expect(supplementKind({ name: 'Calcium carbonate' })?.id).toBe('calcium')
    expect(supplementKind({ name: 'Caltrate', genericName: 'Calcium + Vitamin D3' })?.id).toBe('calcium')
    expect(supplementKind({ name: 'Vitamin D3' })?.id).toBe('vitd')
    expect(supplementKind({ name: 'Neurobion', genericName: 'Vitamin B12' })?.id).toBe('b12')
    expect(supplementKind({ name: 'Ferrous sulfate' })?.id).toBe('iron')
    expect(supplementKind({ name: 'Fish oil 1000' })?.id).toBe('fishoil')
    expect(supplementKind({ name: 'Centrum Multivitamin' })?.id).toBe('multi')
    expect(supplementKind({ name: 'Losartan' })).toBeNull()
    expect(supplementKind({ name: 'Amlodipine' })).toBeNull()
  })
  it('amounts in the unit the bar uses; IU of vitamin D is 40 IU per mcg; a wrong or missing unit is null', () => {
    expect(amountIn('500 mg', kind('calcium'))).toBe(500)
    expect(amountIn('1 g', kind('calcium'))).toBe(1000)
    expect(amountIn('1000 IU', kind('vitd'))).toBe(25)
    expect(amountIn('25 mcg', kind('vitd'))).toBe(25)
    expect(amountIn('1000 mcg', kind('b12'))).toBe(1000)
    expect(amountIn('1 mg', kind('b12'))).toBe(1000)
    expect(amountIn('65 mg', kind('iron'))).toBe(65)
    expect(amountIn('500 IU', kind('calcium'))).toBeNull() // IU only means something for vitamin D
    expect(amountIn('one tablet', kind('calcium'))).toBeNull()
    expect(amountIn(undefined, kind('calcium'))).toBeNull()
    expect(amountIn('500 mg', kind('fishoil'))).toBeNull() // no bar for it
  })
  const takes = [{ name: 'Calcium carbonate', medicationId: 'Calcium carbonate' }, { name: 'Calcium carbonate', medicationId: 'Calcium carbonate' }, { name: 'Vitamin D3', skipped: true }]
  it('counts doses taken today by medication id or name, never a skipped one, and multiplies a 2-tablet dose', () => {
    const items = supplementItems([med({ name: 'Calcium carbonate', strength: '500 mg', dose: '1 tablet' }), med({ name: 'Vitamin D3', strength: '1000 IU' }), med({ name: 'Losartan', strength: '50 mg' })], takes)
    expect(items.map((i) => [i.label, i.taken, i.perDose])).toEqual([['Calcium', 2, 500], ['Vitamin D', 0, 25]])
    expect(supplementItems([med({ name: 'Calcium carbonate', strength: '500 mg', dose: '2 tablets' })], takes)[0]!.perDose).toBe(1000)
  })
  it('totals: doses x amount; no amount on the list means no number (null), not 0; a taken-nothing supplement is a real 0', () => {
    const items = supplementItems([
      med({ name: 'Calcium carbonate', strength: '500 mg' }), med({ name: 'Vitamin D3', strength: '1000 IU' }),
      med({ name: 'Iron', strength: undefined }), med({ name: 'Multivitamin', strength: '1 tablet' })
    ], takes)
    const t = supplementTotals(items)
    expect(t.calciumMg).toBe(1000)
    expect(t.vitdUg).toBe(0)
    expect('ironMg' in t).toBe(false)
    expect(Object.keys(t).sort()).toEqual(['calciumMg', 'vitdUg'])
  })
})
