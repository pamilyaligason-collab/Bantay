import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { parseDrought } from '../../../supabase/functions/pagasa-drought/drought'
import boholJson from '../../../supabase/functions/pagasa-drought/fixtures/bohol.json'
import socotJson from '../../../supabase/functions/pagasa-drought/fixtures/south-cotabato.json'

const s = vi.hoisted(() => ({ res: { data: null as unknown, error: null as null | { message: string; code?: string } }, calls: [] as string[] }))
vi.mock('../auth/client', () => ({
  supabase: { from: (t: string) => ({ select: (cols: string) => ({ limit: async () => { s.calls.push(`${t}|${cols}`); return s.res } }) }) }
}))
import { addMonths, chipMonths, dryAhead, dryWhen, isStale, loadDrought, manilaYm, outlookSentence, resetDrought, type DroughtMonth } from './drought'

const FIXTURES: Record<string, unknown> = { 'bohol.json': boholJson, 'south-cotabato.json': socotJson } // real PAGASA answers saved 10 Nov 2026
const real = (n: string, p: string) => parseDrought(FIXTURES[n], p)!
const BOHOL = real('bohol.json', 'Bohol') // PAGASA, issued 3 Nov 2026
const SOCOT = real('south-cotabato.json', 'South Cotabato')
const m = (month: string, level: DroughtMonth['level'], kind: DroughtMonth['kind'] = 'outlook'): DroughtMonth => ({ month, level, kind })

describe('outlookSentence (hand-written from the real outlooks)', () => {
  it('Bohol in November: dry spell from January, drought February to April', () => {
    expect(outlookSentence(BOHOL.months, '2026-11')).toBe('Dry spell expected from January; drought possible February to April.')
  })
  it('South Cotabato in November: spell from January, drought March to April', () => {
    expect(outlookSentence(SOCOT.months, '2026-11')).toBe('Dry spell expected from January; drought possible March to April.')
  })
  it('drought alone, a single drought month, dry condition only, and all clear', () => {
    expect(outlookSentence([m('2026-11', 'not_affected'), m('2026-12', 'drought'), m('2027-01', 'drought')], '2026-11')).toBe('Drought possible December to January.')
    expect(outlookSentence([m('2026-11', 'not_affected'), m('2026-12', 'drought')], '2026-11')).toBe('Drought possible in December.')
    expect(outlookSentence([m('2026-11', 'not_affected'), m('2026-12', 'dry_condition')], '2026-11')).toBe('Dry conditions possible in December. No dry spell expected.')
    expect(outlookSentence([m('2026-11', 'not_affected'), m('2026-12', 'not_affected')], '2026-11')).toBe('No dry spell or drought expected in the coming months.')
  })
  it('a dry spell already in this month reads "now"', () => {
    expect(outlookSentence([m('2026-11', 'dry_spell'), m('2026-12', 'drought')], '2026-11')).toBe('Dry spell now; drought possible in December.')
  })
  it('months already past are ignored; nothing ahead reads as not available', () => {
    expect(outlookSentence([m('2026-09', 'drought'), m('2026-10', 'dry_spell')], '2026-11')).toBe('Climate outlook not available yet.')
    expect(outlookSentence([], '2026-11')).toBe('Climate outlook not available yet.')
  })
  it('every sentence stays under 20 words', () => {
    for (const x of [outlookSentence(BOHOL.months, '2026-11'), outlookSentence(SOCOT.months, '2026-11')]) expect(x.split(/\s+/).length).toBeLessThan(20)
  })
})

describe('chipMonths', () => {
  it('Bohol in November: Now (the October assessment) then six outlook months', () => {
    const c = chipMonths(BOHOL.months, '2026-11')
    expect(c.map((x) => x.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'])
    expect(c[0]!.kind).toBe('assessment')
  })
  it('past months drop, and the outlook months come in whole rows of three', () => {
    expect(chipMonths(BOHOL.months, '2027-01').map((x) => x.month)).toEqual(['2026-10', '2027-01', '2027-02', '2027-03']) // four left: three shown
    expect(chipMonths(BOHOL.months, '2027-02').map((x) => x.month)).toEqual(['2026-10', '2027-02', '2027-03', '2027-04'])
    expect(chipMonths(BOHOL.months, '2027-03').map((x) => x.month)).toEqual(['2026-10', '2027-03', '2027-04']) // two left: both shown
  })
})

describe('dryAhead and the month helpers', () => {
  it('reads the outlook months the Climate card shows (S29 TD round 2, A4)', () => {
    expect(dryWhen(SOCOT.months, '2026-11')).toEqual({ ym: '2027-01', level: 'dry_spell' }) // Nov not affected, Dec dry condition, Jan-Feb dry spell, Mar-Apr drought
    expect(dryWhen(SOCOT.months, '2026-10')).toEqual({ ym: '2027-01', level: 'dry_spell' }) // the old three-month window (Oct to Dec) saw none
    expect(dryWhen(SOCOT.months, '2027-05')).toBeNull()
    expect(dryAhead(BOHOL.months, '2026-11')).toBe(true) // January is a dry spell
    expect(dryAhead(BOHOL.months, '2026-10')).toBe(true) // January is one of the six shown months
    expect(dryAhead(BOHOL.months, '2027-05')).toBe(false)
    expect(dryAhead(null, '2026-11')).toBe(false)
    expect(dryAhead([m('2026-11', 'dry_condition'), m('2026-12', 'dry_condition')], '2026-11')).toBe(false)
    expect(dryAhead([m('2026-01', 'drought', 'assessment')], '2026-01')).toBe(false) // an assessment is not an outlook
  })
  it('addMonths crosses the year', () => {
    expect(addMonths('2026-12', 2)).toBe('2027-02')
    expect(addMonths('2026-11', 0)).toBe('2026-11')
    expect(addMonths('2026-01', 12)).toBe('2027-01')
  })
  it('the month is Manila time at both ends of the day (23:30 and 00:30 local, ML-38)', () => {
    expect(manilaYm(new Date('2026-11-30T15:30:00Z'))).toBe('2026-11') // 23:30 Manila, 30 Nov
    expect(manilaYm(new Date('2026-11-30T16:30:00Z'))).toBe('2026-12') // 00:30 Manila, 1 Dec
  })
  it('an outlook is stale after 60 days', () => {
    const now = Date.parse('2026-11-10T00:00:00Z')
    expect(isStale('2026-11-03', now)).toBe(false)
    expect(isStale('2026-09-11', now)).toBe(false) // 60 days
    expect(isStale('2026-09-10', now)).toBe(true)
  })
})

describe('loadDrought', () => {
  beforeEach(async () => { await db.kv.clear(); resetDrought(); s.calls.length = 0; s.res = { data: null, error: null } })
  const rows = (...r: unknown[]) => { s.res = { data: r, error: null } }
  const bohol = { province: 'Bohol', issued_at: '2026-11-03', fetched_at: '2026-11-10T00:00:00Z', months: BOHOL.months }

  it('reads every province row (no place is sent) and picks the province, case-insensitively', async () => {
    rows({ province: 'Cebu', issued_at: '2026-11-03', months: [m('2026-11', 'drought')] }, bohol)
    const d = await loadDrought('bohol')
    expect(d).toMatchObject({ province: 'Bohol', issued_at: '2026-11-03', saved: false })
    expect(d!.months).toHaveLength(7)
    expect(s.calls).toEqual(['pagasa_drought|province,issued_at,months,fetched_at']) // select all, no filter on the province
  })
  it('a province with no row is null; a row with no outlook month or a bad month is dropped', async () => {
    rows(bohol, { province: 'Abra', issued_at: '2026-11-03', months: [m('2026-10', 'drought', 'assessment')] }, { province: 'Aklan', issued_at: '2026-11-03', months: [{ month: '2026-13', level: 'drought', kind: 'outlook' }] })
    expect(await loadDrought('Cebu')).toBeNull()
    expect(await loadDrought('Abra')).toBeNull()
    expect(await loadDrought('Aklan')).toBeNull()
  })
  it('a failed read falls back to the copy kept on the phone, marked saved', async () => {
    rows(bohol)
    await loadDrought('Bohol')
    resetDrought()
    s.res = { data: null, error: { message: 'network' } }
    const d = await loadDrought('Bohol')
    expect(d).toMatchObject({ province: 'Bohol', saved: true })
    expect(d!.months).toHaveLength(7)
    expect(await loadDrought('Cebu')).toBeNull() // nothing kept for another province
  })
  it('a table that does not exist yet reads as null, not an error, and keeps nothing', async () => {
    s.res = { data: null, error: { message: 'relation "public.pagasa_drought" does not exist', code: '42P01' } }
    expect(await loadDrought('Bohol')).toBeNull()
    expect(await db.kv.get('garden.drought.Bohol')).toBeUndefined()
  })
})
