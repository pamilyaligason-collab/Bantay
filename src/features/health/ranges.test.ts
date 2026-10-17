import { describe, expect, it } from 'vitest'
import { GUIDE, GUIDE_LABEL, latestByTest, latestVsNormal, position, type Reading } from './ranges'

const base: Reading = { personId: 'p1', takenAt: '2024-01-01', test: 'ldl', value: 120, unit: 'mg/dL' }

describe('latestVsNormal', () => {
  it('shows the lab range first and the labelled guide second', () => {
    const r = latestVsNormal({ ...base, labLow: 0, labHigh: 130 })
    expect(r.lab.text).toBe('0 to 130')
    expect(r.headlineFrom).toBe('lab')
    expect(r.headline).toBe('within')
    expect(r.guide?.label).toBe(GUIDE_LABEL)
    expect(r.guide?.position).toBe('above')
    expect(r.guide?.source).toMatch(/MedlinePlus/)
  })
  it('a family threshold overrides lab and guide', () => {
    const r = latestVsNormal({ ...base, labLow: 0, labHigh: 130 }, { low: null, high: 100 })
    expect(r.headlineFrom).toBe('family')
    expect(r.headline).toBe('above')
  })
  it('falls back to the guide when the lab printed no range', () => {
    const r = latestVsNormal({ ...base, value: 90 })
    expect(r.headlineFrom).toBe('guide')
    expect(r.headline).toBe('within')
  })
  it('has no headline for a test with neither range', () => {
    const r = latestVsNormal({ ...base, test: 'made_up_test' })
    expect(r.headline).toBe('none')
    expect(r.guide).toBeNull()
  })
})

describe('guide ranges', () => {
  it('every entry cites a source, url and year', () => {
    for (const g of Object.values(GUIDE)) {
      expect(g.source).toBeTruthy()
      expect(g.url).toMatch(/^https:\/\//)
      expect(g.year).toBeGreaterThan(2015)
    }
  })
  it('position handles bounds', () => {
    expect(position(5, { low: 5, high: 5 })).toBe('within')
    expect(position(4, { low: 5, high: null })).toBe('below')
  })
})

it('latestByTest keeps the newest reading per test', () => {
  const out = latestByTest([base, { ...base, takenAt: '2024-06-01', value: 99 }, { ...base, test: 'hdl' }])
  expect(out.find((r) => r.test === 'ldl')?.value).toBe(99)
  expect(out).toHaveLength(2)
})
