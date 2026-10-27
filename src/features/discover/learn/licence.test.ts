import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script, no types
import { findMarkers, scan } from '../../../../scripts/knowledge/learn-licence-check.mjs'

describe('learn licence check', () => {
  it('finds ASHP, A.D.A.M. and the other banned markers', () => {
    expect(findMarkers('Copyright ASHP 2024')).toHaveLength(1)
    expect(findMarkers('Updated by A.D.A.M., Inc.').length).toBeGreaterThan(0)
    expect(findMarkers('from the American Society of Health-System Pharmacists')).toHaveLength(1)
    expect(findMarkers('AHFS and Micromedex')).toHaveLength(2)
    expect(findMarkers('Written by Bantay from DailyMed and NIH ODS.')).toEqual([])
  })
  it('the Learn data and screens carry none (fails the build on a hit)', () => {
    expect(scan(['src/data/learn', 'src/features/discover/learn'])).toEqual([])
  })
})
