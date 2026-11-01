import { describe, expect, it } from 'vitest'
import hotlines from '../../data/safety/hotlines.json'
import { crisisLines, telHref } from './crisis'

describe('crisis lines', () => {
  it('keeps only verified PH mental-health rows, never UNVERIFIED', () => {
    const rows = crisisLines(hotlines)
    expect(rows.map((r) => r.id)).toEqual(['hl-ncmh', 'hl-ncmh-globe', 'hl-ncmh-smart'])
    expect(rows.every((r) => r.status !== 'UNVERIFIED' && r.zone === 'ph')).toBe(true)
    const ncmh = hotlines.find((r) => r.id === 'hl-ncmh')!
    expect(crisisLines([{ ...ncmh, status: 'UNVERIFIED' }])).toEqual([])
  })
  it('splits "a / b" phones into tel: links with digits only', () => {
    expect(crisisLines(hotlines)[0]!.numbers).toEqual(['1553', '1800-1888-1553'])
    expect(telHref('0919-057-1553')).toBe('tel:09190571553')
  })
})
