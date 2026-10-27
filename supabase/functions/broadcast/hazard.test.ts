// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ALERT_KIND, TEMPLATES } from '../_shared/templates.ts'
import { HAZARD_IDS, SAFETY_IDS, hazardRef, isHazardId } from './logic.ts'

describe('broadcast hazard rows (D-78)', () => {
  it('only the three hazard templates become rows, and each maps to the hazard kind; family_sos never does', () => {
    expect([...HAZARD_IDS]).toEqual(['storm_warning', 'flood_watch', 'heat_alert'])
    for (const t of HAZARD_IDS) { expect(ALERT_KIND[t]).toBe('hazard'); expect(TEMPLATES[t].cls).toBe('safety') }
    expect(isHazardId('family_sos')).toBe(false)
    expect(SAFETY_IDS.filter(isHazardId)).toEqual([...HAZARD_IDS])
  })
  it('the ref is the template and a 10 minute bucket: a double click is one row, a later broadcast is another', () => {
    const t0 = Date.parse('2026-10-26T10:00:00Z')
    expect(hazardRef('storm_warning', t0)).toBe(hazardRef('storm_warning', t0 + 599_000))
    expect(hazardRef('storm_warning', t0)).not.toBe(hazardRef('storm_warning', t0 + 600_000))
    expect(hazardRef('storm_warning', t0)).not.toBe(hazardRef('flood_watch', t0))
    expect(hazardRef('heat_alert', t0)).not.toMatch(/\s/)
  })
})
