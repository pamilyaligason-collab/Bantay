import { describe, expect, it } from 'vitest'
import { buildPack, dialable, hazardsEntry, nextVersion, parseCsv, staleRows, toPlace, validateRow } from '../../../scripts/local-data/lib.mjs'

const CSV = `id,province,lgu,kind,name,address,phones,lat,lon,capacity,status,source,source_url,licence,source_date,last_verified_at,confidence,notes
boh-drrmo-tagbilaran,Bohol,City of Tagbilaran,drrmo,"Tagbilaran CDRRMO, rescue",,"(038) 411-1234 ; 0917 000 0000",,,,confirmed,City site,https://example.gov.ph/a,unstated,2025-02-10,2026-10-31,high,"says ""24/7"""
boh-evac-dao,Bohol,City of Tagbilaran,evac,Dao evacuation centre,Dao,,9.65,123.86,300,not_confirmed,PNA,https://example.ph/b,unstated,2018-12-18,,low,
`
const codes = { Bohol: '0701200000' }

describe('local safety data job', () => {
  const rows = parseCsv(CSV)

  it('parses quoted commas, doubled quotes and empty fields', () => {
    expect(rows).toHaveLength(2)
    expect(rows[0]!.name).toBe('Tagbilaran CDRRMO, rescue')
    expect(rows[0]!.notes).toBe('says "24/7"')
    expect(rows[1]!.address).toBe('Dao')
  })

  it('accepts good rows and names each problem in a bad one', () => {
    expect(rows.flatMap(validateRow)).toEqual([])
    const bad = validateRow({ ...rows[0]!, kind: 'school', status: 'confirmed', source_url: '', lat: '50', lon: '' })
    expect(bad.join('\n')).toMatch(/kind "school"/)
    expect(bad.join('\n')).toMatch(/lat and lon go together/)
    expect(bad.join('\n')).toMatch(/confirmed row needs the source_url/)
  })

  it('maps a row to the table shape and refuses an unknown province', () => {
    const p = toPlace(rows[0]!, codes)
    expect(p.phones).toEqual(['(038) 411-1234', '0917 000 0000'])
    expect(p.verified_by).toBe('seed-review')
    expect(toPlace(rows[1]!, codes).verified_by).toBeNull()
    expect(() => toPlace({ ...rows[0]!, province: 'Atlantis' }, codes)).toThrow(/no PSGC code/)
    expect(p.source_date).toBe('2025-02-10')
  })

  it('looks LGU codes up within the province, since names repeat across provinces', () => {
    const lgus = { '0701200000|Carmen': '0701216000', '0704700000|Carmen': '0704713000' }
    expect(toPlace({ ...rows[0]!, lgu: 'Carmen' }, codes, lgus).psgc_code).toBe('0701216000')
    expect(() => toPlace({ ...rows[0]!, lgu: 'Nowhere' }, codes, lgus)).toThrow(/no PSGC code for "Nowhere"/)
  })

  it('tells tap-to-dial numbers from printed text', () => {
    for (const ok of ['0917 000 0000', '(038) 411-4868', '+63 83 552 3939', '911', '117']) expect(dialable(ok)).toBe(true)
    for (const no of ['552-3939', '(083) 500-8050 to 51', '(038) 411 – 4868 / 4869', '552-8861 (TO 62)']) expect(dialable(no)).toBe(false)
  })

  it('builds the same pack bytes whatever the row order, and leaves unchecked rows out', () => {
    const places = rows.map((r) => toPlace(r, codes))
    const a = buildPack({ psgc_code: '0701200000', name: 'Bohol' }, places)
    const b = buildPack({ psgc_code: '0701200000', name: 'Bohol' }, [...places].reverse())
    expect(a.checksum).toBe(b.checksum)
    expect(a.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(a.rowCount).toBe(1) // the evac row has no last_verified_at
    expect(JSON.parse(a.body).places[0].id).toBe('boh-drrmo-tagbilaran')
  })

  it('bumps the version only when the content changes', () => {
    expect(nextVersion(undefined, 'x')).toEqual({ version: 1, changed: true })
    expect(nextVersion({ version: 3, checksum: 'x' }, 'x')).toEqual({ version: 3, changed: false })
    expect(nextVersion({ version: 3, checksum: 'x' }, 'y')).toEqual({ version: 4, changed: true })
  })

  it('points a unit at its newest hazard pack, or at the pack that covers it, and at nothing without one', () => {
    const bounds = { flood: [1, 2, 3, 4] }
    const manifest = { '1206300000': { bounds }, '1230800000': { pack: '1206300000' }, '0701200000': { bounds } }
    const row = (version: number) => ({ province_code: '1206300000', version, checksum: `c${version}`, size_bytes: 9, storage_path: `p${version}` })
    const rows = [row(1), row(2)]
    const want = { pack: '1206300000', version: 2, checksum: 'c2', size: 9, path: 'p2', bounds }
    expect(hazardsEntry('1206300000', manifest, rows)).toEqual(want)
    expect(hazardsEntry('1230800000', manifest, rows)).toEqual(want)
    expect(hazardsEntry('0701200000', manifest, rows)).toBeUndefined()
    expect(hazardsEntry('0000000000', manifest, rows)).toBeUndefined()
  })
  it('flags rows older than N days and rows never checked', () => {
    const old = staleRows([{ last_verified_at: '2026-01-01' }, { last_verified_at: '2026-10-01' }, { last_verified_at: null }], 180, '2026-10-31')
    expect(old.map((p) => p.last_verified_at)).toEqual(['2026-01-01', null])
  })
})
