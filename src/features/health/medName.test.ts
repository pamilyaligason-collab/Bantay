import { describe, expect, it } from 'vitest'
import { givenName, properName, shortMedName } from './medName'

describe('names (S6, S9; ML-35)', () => {
  it('properName: all-lower or all-upper words become proper case, mixed case stays', () => {
    expect(properName('loyd sevilla')).toBe('Loyd Sevilla')
    expect(properName('SEVILLA, loyd')).toBe('Sevilla, Loyd')
    expect(properName('Ma. McDonald')).toBe('Ma. McDonald')
  })
  it('givenName: given first, SURNAME-comma-given, a title first, a suffix after a comma', () => {
    expect(givenName('loyd sevilla')).toBe('Loyd')
    expect(givenName('SEVILLA, loyd')).toBe('Loyd')
    expect(givenName('Dr. Ben Cruz')).toBe('Ben')
    expect(givenName('Ben Cruz, Jr.')).toBe('Ben')
    expect(givenName('Ben Cruz, MD')).toBe('Ben')
    expect(givenName('Ma. Clara Santos')).toBe('Ma. Clara')
    expect(givenName('Papa')).toBe('Papa')
    expect(givenName('')).toBe('')
  })
})

// Expected strings are computed by hand from the rule in medName.ts (first 1-2 words before a bracket or digit, plus the form word), not copied from the function output.
describe('shortMedName', () => {
  const cases: [string, string][] = [
    ['Sea Water ( HUMER 050 HYPERTONIC NASAL SPRAY (CHILD) )', 'Sea water nasal spray'],
    ['acetylcisteine (FLUIMUCIL 600MG)', 'Acetylcisteine'],
    ['cefixime (TERGECEF 200)', 'Cefixime'],
    ['Amlodipine (NORVASC) 5MG', 'Amlodipine'],
    ['Amlodipine (BESYLATE) 5mg', 'Amlodipine'],
    ['Clopidogrel (BISULFATE) 75mg', 'Clopidogrel'],
    ['Cetirizine (DIHYDROCHLORIDE) 10mg', 'Cetirizine'],
    ['Insulin (NPH) 100IU/ML', 'Insulin'],
    ['Vitamin D3 (CHOLECALCIFEROL) 1000IU', 'Vitamin D3'],
    ['Paracetamol (ACETAMINOPHEN) 500mg', 'Paracetamol'],
    ['Losartan (MSD) 50mg', 'Losartan'],
    ['Losartan 50mg tablet', 'Losartan tablet'],
    ['PARACETAMOL (CHILD) 250MG/5ML SYRUP', 'Paracetamol syrup'],
    ['Amoxicillin 500 mg capsule x 21', 'Amoxicillin capsule'],
    ['Vitamin C (Ascorbic Acid) 500mg', 'Vitamin C'],
    ['AMOXICILLIN (AS TRIHYDRATE) 500MG CAPSULE', 'Amoxicillin capsule'],
    ['AMOXICILLIN (AS TRIHYDRATE) 500MG', 'Amoxicillin'],
    ['Amlodipine (AS BESILATE) 5mg tablet', 'Amlodipine tablet'],
    ['Metformin (BID)', 'Metformin'],
    ['Amlodipine (TABLET) 5mg', 'Amlodipine tablet'],
    ['Vitamin B (B-COMPLEX)', 'Vitamin B'],
    ['SALBUTAMOL (VENTOLIN NEBULE 2.5MG/2.5ML)', 'Salbutamol nebule'],
    ['PNEUMOCOCCAL POLYSACCHARIDE VACCINE, POLYVALENT', 'Pneumococcal polysaccharide'],
    ['Metformin Hydrochloride Extended-Release Tablets 500 mg', 'Metformin hydrochloride'], // with "tablet" it would be 30 chars > 28, so the form is dropped
    ['Salbutamol Sulfate Inhaler 100mcg', 'Salbutamol sulfate inhaler'], // 26 chars
    ['Betamethasone eye drops 0.1%', 'Betamethasone eye drops']
  ]
  for (const [raw, want] of cases) it(`${raw} -> ${want}`, () => expect(shortMedName(raw)).toBe(want))
  it('never longer than 28 characters, never empty', () => {
    expect(shortMedName('Supercalifragilisticexpialidocious tablets').length).toBeLessThanOrEqual(28)
    expect(shortMedName('500mg')).toBe('500mg') // nothing readable left: fall back to the raw label
    expect(shortMedName('')).toBe('')
  })
  it('keeps the first word of a plain name', () => expect(shortMedName('Aspirin 80mg').split(' ')[0]).toBe('Aspirin'))
})
