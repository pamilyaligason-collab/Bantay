import { describe, expect, it } from 'vitest'
import type { Medication } from '../log/store'
import { medicinesActingHere, SYSTEM_INFO, yourNumbers } from './systemInfo'
import content from './content.json'

const med = (name: string, o: Partial<Medication> = {}): Medication => ({ personId: 'p', name, medStatus: 'active', ...o })

describe('Explore your body info', () => {
  it('every system has two plain lines and a learn topic', () => {
    for (const s of content.systems) {
      const i = SYSTEM_INFO[s.id]!
      expect(i, s.id).toBeTruthy()
      expect(i.what).toHaveLength(2)
      expect(i.learn.length).toBeGreaterThan(3)
    }
  })
  it('medicines that act here: matched by normalised name, live only, by system', () => {
    const meds = [med('Amlodipine 5 mg tab'), med('Metformin', { strength: '500 mg' }), med('Atorvastatin 20mg'), med('Losartan', { medStatus: 'paused' }), med('Paracetamol')]
    expect(medicinesActingHere(meds, 'heart').map((m) => m.name)).toEqual(['Amlodipine 5 mg tab', 'Atorvastatin 20mg'])
    expect(medicinesActingHere(meds, 'heart')[1]!.effect).toBe('lowers LDL cholesterol')
    expect(medicinesActingHere(meds, 'hormones')).toEqual([{ name: 'Metformin 500 mg', effect: 'lowers blood sugar' }])
    expect(medicinesActingHere(meds, 'lungs')).toEqual([])
  })
  it('your numbers: the latest readings of that system, blood pressure joined, linking to the metric', () => {
    const r = (test: string, value: number, unit = '') => ({ personId: 'p', takenAt: '2026-10-20T00:00:00Z', test, value, unit })
    const n = yourNumbers('heart', [r('bp_systolic', 126, 'mmHg'), r('bp_diastolic', 80, 'mmHg'), r('heart_rate', 72, 'bpm'), r('weight', 60, 'kg')])
    expect(n).toEqual({ text: 'Blood pressure 126/80 · Pulse 72 bpm', code: 'bp_systolic' })
    expect(yourNumbers('lungs', [])).toBeNull()
  })
})
