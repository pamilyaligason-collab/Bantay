import { describe, expect, it } from 'vitest'
import hotlines from '../../data/safety/hotlines.json'
import { crisisLines, telHref } from './crisis'

describe('crisis lines', () => {
  it('keeps only listed or confirmed PH mental-health rows, never UNVERIFIED or UNKNOWN', () => {
    const rows = crisisLines(hotlines)
    expect(rows.map((r) => r.id)).toEqual(['hl-ncmh', 'hl-ncmh-globe', 'hl-ncmh-smart'])
    const ncmh = hotlines.find((r) => r.id === 'hl-ncmh')!
    for (const status of ['UNVERIFIED', 'UNKNOWN', 'FAMILY']) expect(crisisLines([{ ...ncmh, status }])).toEqual([])
    expect(crisisLines([{ ...ncmh, status: 'CONFIRMED' }])).toHaveLength(1)
  })
  it('skips a row with no phone', () => {
    const ncmh = hotlines.find((r) => r.id === 'hl-ncmh')!
    expect(crisisLines([{ ...ncmh, phone: null }])).toEqual([])
  })
  it('splits "a / b" phones into tel: links with digits only', () => {
    expect(crisisLines(hotlines)[0]!.numbers).toEqual(['1553', '1800-1888-1553'])
    expect(telHref('0919-057-1553')).toBe('tel:09190571553')
  })
})
