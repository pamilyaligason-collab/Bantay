import { describe, expect, it } from 'vitest'
import { bpNearGuide, labsLine } from './GlanceGrid'
import type { Reading } from './ranges'

const now = new Date(2026, 9, 30, 12, 0, 0) // 30 Oct 2026, noon local
const at = (daysAgo: number, h = 9) => new Date(2026, 9, 30 - daysAgo, h).toISOString()
const bp = (v: number, daysAgo: number, h?: number): Reading => ({ personId: 'p', test: 'bp_systolic', value: v, unit: 'mmHg', takenAt: at(daysAgo, h) })

describe('bpNearGuide', () => {
  it('counts the days of the last 7 on which every top number was inside the guide', () => {
    // day -1: 110 and 112 (both inside), day -3: 150 (outside), day -9: outside the window
    expect(bpNearGuide([bp(110, 1, 8), bp(112, 1, 20), bp(150, 3), bp(110, 9)], now)).toEqual({ near: 1, logged: 2 })
  })
  it('one high reading spoils its day', () => {
    expect(bpNearGuide([bp(110, 1, 8), bp(150, 1, 20)], now)).toEqual({ near: 0, logged: 1 })
  })
  it('no BP at all is logged 0, never "0 near"', () => {
    expect(bpNearGuide([], now)).toEqual({ near: 0, logged: 0 })
    expect(bpNearGuide([{ personId: 'p', test: 'weight', value: 60, unit: 'kg', takenAt: at(1) }], now)).toEqual({ near: 0, logged: 0 })
  })
})

describe('labsLine', () => {
  const lab = (test: string, value: number, high: number, daysAgo: number): Reading => ({ personId: 'p', test, value, unit: 'mg/dL', takenAt: at(daysAgo), labLow: 0, labHigh: high })
  it('counts results outside their own printed range and names the newest paper date', () => {
    const line = labsLine([lab('ldl', 162, 130, 20), lab('creatinine', 0.9, 1.1, 20), lab('hba1c', 9, 5.6, 40)], [])
    expect(line.startsWith('2 to ask · ')).toBe(true)
  })
  it('everything inside: "All in range", nothing at all: "No papers yet"', () => {
    expect(labsLine([lab('creatinine', 0.9, 1.1, 3)], []).startsWith('All in range · ')).toBe(true)
    expect(labsLine([bp(120, 1)], [])).toBe('No papers yet')
  })
})
