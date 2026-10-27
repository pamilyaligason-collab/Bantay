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

// Expected strings are computed by hand from the rules in medName.ts, not copied from the function output.
describe('shortMedName', () => {
  const cases: [string, string][] = [
    ['Sea Water ( HUMER 050 HYPERTONIC NASAL SPRAY (CHILD) )', 'Humer nasal spray'],
    ['acetylcisteine (FLUIMUCIL 600MG)', 'Fluimucil'],
    ['cefixime (TERGECEF 200)', 'Tergecef'],
    ['Losartan 50mg tablet', 'Losartan tablet'],
    ['PARACETAMOL (CHILD) 250MG/5ML SYRUP', 'Paracetamol syrup'],
    ['Amoxicillin 500 mg capsule x 21', 'Amoxicillin capsule'],
    ['Vitamin C (Ascorbic Acid) 500mg', 'Vitamin C'],
    // J r2: a salt, schedule or form note in capitals is not a brand and never replaces the first word (hand-computed)
    ['AMOXICILLIN (AS TRIHYDRATE) 500MG CAPSULE', 'Amoxicillin capsule'],
    ['AMOXICILLIN (AS TRIHYDRATE) 500MG', 'Amoxicillin'],
    ['Amlodipine (AS BESILATE) 5mg tablet', 'Amlodipine tablet'],
    ['Metformin (BID)', 'Metformin'],
    ['Amlodipine (TABLET) 5mg', 'Amlodipine'],
    ['Vitamin B (B-COMPLEX)', 'Vitamin B'],
    ['SALBUTAMOL (VENTOLIN NEBULE 2.5MG/2.5ML)', 'Ventolin nebule'],
    ['Metformin Hydrochloride Extended-Release Tablets 500 mg', 'Metformin hydrochloride'] // 23 chars; adding "extended-release" would make 40 > 28
  ]
  for (const [raw, want] of cases) it(`${raw} -> ${want}`, () => expect(shortMedName(raw)).toBe(want))
  it('never longer than 28 characters, never empty', () => {
    expect(shortMedName('Supercalifragilisticexpialidocious tablets').length).toBeLessThanOrEqual(28)
    expect(shortMedName('500mg')).toBe('500mg') // nothing readable left: fall back to the raw label
    expect(shortMedName('')).toBe('')
  })
  it('keeps the first word of a plain name', () => expect(shortMedName('Aspirin 80mg').split(' ')[0]).toBe('Aspirin'))
})
