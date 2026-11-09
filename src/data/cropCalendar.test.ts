import { describe, expect, it } from 'vitest'
import calendar from './cropCalendar.json'
import climate from './provinceClimate.json'
import { climateTypeFor } from './provinceClimate'

type Crop = { name: string; tagalog: string | null; months: number[] }
const types = calendar.types as Record<string, { crops: Crop[] }>

// Read by eye from the page images (type, crop, month 1-12, planting?), not from the build script.
const HAND_CHECK: [string, string, number, boolean][] = [
  ['1', 'Bitter gourd', 1, true],
  ['1', 'Bitter gourd', 8, false],
  ['1', 'Cowpea', 11, true],
  ['1', 'Cowpea', 12, false],
  ['1', 'Lettuce', 8, true],
  ['1', 'Yardlong bean', 10, false],
  ['2', 'Okra', 7, true],
  ['2', 'Carrot', 4, true],
  ['2', 'Carrot', 1, false],
  ['2', 'Yardlong bean', 5, true],
  ['2', 'Sugar beet', 1, true],
  ['2', 'Yam bean', 10, true],
  ['3', 'Bitter gourd', 5, true],
  ['3', 'Bitter gourd', 1, false],
  ['3', 'Carrot', 10, true],
  ['3', 'Wax gourd', 7, true],
  ['3', 'Hyacinth bean', 12, false],
  ['3', 'Yardlong bean', 1, true],
  ['4', 'Bitter gourd', 11, true],
  ['4', 'Bottle gourd', 11, true],
  ['4', 'Cabbage', 11, true],
  ['4', 'Chayote', 11, true],
  ['4', 'Cowpea', 11, true],
  ['4', 'Cucumber', 11, true],
  ['4', 'Celery', 2, true],
  ['4', 'Spinach', 4, true],
  ['4', 'Bitter gourd', 7, false],
  ['4', 'Yardlong bean', 3, false],
]

describe('cropCalendar.json', () => {
  it('has the bulletin credit and four types', () => {
    expect(calendar.year).toBe(2000)
    expect(calendar.bulletin).toContain('200/2000')
    expect(Object.keys(types).sort()).toEqual(['1', '2', '3', '4'])
  })

  it('has the row counts read from the bulletin (36, 37, 38, 36)', () => {
    expect(['1', '2', '3', '4'].map((t) => types[t].crops.length)).toEqual([36, 37, 38, 36])
  })

  it('keeps every crop well formed: sorted unique months in 1..12, name, tagalog string or null', () => {
    for (const t of Object.values(types)) {
      for (const c of t.crops) {
        expect(c.name.length).toBeGreaterThan(0)
        expect(c.tagalog === null || typeof c.tagalog === 'string').toBe(true)
        expect(c.months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)).toBe(true)
        expect([...new Set(c.months)].sort((a, b) => a - b)).toEqual(c.months)
      }
    }
  })

  it.each(HAND_CHECK)('type %s %s month %i planting=%s', (type, name, month, expected) => {
    const crop = types[type].crops.find((c) => c.name === name)
    expect(crop, `${name} in type ${type}`).toBeDefined()
    expect(crop!.months.includes(month)).toBe(expected)
  })
})

describe('provinceClimate.json', () => {
  const provinces = climate.provinces as Record<string, { type: number; uncertain?: boolean }>
  it('maps every province to a type 1-4 with no default', () => {
    expect(Object.values(provinces).every((p) => [1, 2, 3, 4].includes(p.type))).toBe(true)
    expect(Object.keys(climate.provinces)).not.toContain('default')
    expect((climate as Record<string, unknown>).default).toBeUndefined()
    expect(climate.sources.length).toBeGreaterThan(2)
  })
  it('puts Bohol and South Cotabato in type 4', () => {
    expect(provinces['Bohol'].type).toBe(4)
    expect(provinces['South Cotabato'].type).toBe(4)
  })
  it('flags the provinces whose bulletin text splits or contradicts', () => {
    for (const n of ['Marinduque', 'Camarines Norte', 'Camarines Sur']) expect(provinces[n].uncertain).toBe(true)
  })
})

describe('climateTypeFor', () => {
  it('returns null for unknown, empty or missing names', () => {
    expect(climateTypeFor('Atlantis')).toBeNull()
    expect(climateTypeFor('')).toBeNull()
    expect(climateTypeFor(undefined)).toBeNull()
  })
  it('matches case and spacing insensitively', () => {
    expect(climateTypeFor('  SOUTH   cotabato ')).toEqual({ type: 4, uncertain: false })
    expect(climateTypeFor('marinduque')).toEqual({ type: 3, uncertain: true })
  })
  it('resolves old names', () => {
    expect(climateTypeFor('Compostela Valley')).toEqual({ type: 4, uncertain: true })
    expect(climateTypeFor('Western Samar')).toEqual({ type: 2, uncertain: false })
    expect(climateTypeFor('Maguindanao')).toEqual({ type: 3, uncertain: true })
  })
})
