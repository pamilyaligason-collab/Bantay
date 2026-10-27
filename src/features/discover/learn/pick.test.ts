import { describe, expect, it } from 'vitest'
import type { Medication } from '../../log/store'
import { MEDCARDS, RECIPES } from './data'
import { articleText, cardFor, pickMeds } from './pick'

const med = (name: string, extra: Partial<Medication> = {}): Medication => ({ personId: 'p1', name, ...extra })

describe("pickMeds ('Mama's medicines')", () => {
  it('3 live medicines give the 2 that have a card and 1 with no card yet', () => {
    const r = pickMeds([med('Losartan 50mg tab', { id: 1 }), med('METFORMIN 500 mg', { id: 2 }), med('Zorbex 10 mg', { id: 3 })])
    expect(r.map((p) => p.card?.id ?? null)).toEqual(['losartan', 'metformin', null])
  })
  it('matches a brand name and the generic name field', () => {
    expect(cardFor(med('Norvasc 5mg'))?.id).toBe('amlodipine')
    expect(cardFor(med('Cozaar', { genericName: 'Losartan potassium' }))?.id).toBe('losartan')
    expect(cardFor(med('Mystery pill', { genericName: 'Cetirizine HCl' }))).toBeNull() // "cetirizine hcl" is not "cetirizine hydrochloride": no guessing
  })
  it('leaves out stopped and deleted rows, and lists a card once', () => {
    const r = pickMeds([med('Amlodipine', { id: 1, medStatus: 'stopped' }), med('Losartan', { id: 2 }), med('Losartan 100 mg', { id: 3 }), { ...med('Metformin', { id: 4 }), deletedAt: 'x' } as Medication])
    expect(r.map((p) => p.card?.id)).toEqual(['losartan'])
  })
  it('a combined product such as losartan with hydrochlorothiazide gets no card (never the wrong one)', () => {
    expect(cardFor(med('Losartan/HCTZ 50/12.5'))).toBeNull()
  })
})

describe('articleText', () => {
  it('returns text for a card and a recipe, null for an unknown id', () => {
    expect(articleText('losartan', { medcards: true })).toContain('Talk to your doctor first')
    expect(articleText('losartan')).toBeNull() // flag off: an unsigned card is never read out
    expect(articleText('sinigang-isda')).toContain('240 milligrams of sodium')
    expect(articleText('nope')).toBeNull()
  })
  it('every card and recipe has text', () => { for (const x of [...MEDCARDS, ...RECIPES]) expect(articleText(x.id, { medcards: true })!.length).toBeGreaterThan(100) })
  it('ids are unique across cards and recipes', () => {
    const ids = [...MEDCARDS, ...RECIPES].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
