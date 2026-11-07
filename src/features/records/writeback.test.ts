// @vitest-environment node
// Synthetic data only. No real names, values or ids anywhere in this file.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { applyPlan, buildMap, buildRows, destName, labsCsv, planWrites, undoManifest, type WbRow } from '../../../scripts/import/writeback.mjs'

const P1 = '11111111-1111-4111-8111-111111111111'
const DOC = 'abcdef12-0000-4000-8000-000000000001'
const FOLDER = join('/maps', 'test-parent')
const MAP = { [P1]: FOLDER }
const row = (o: Partial<WbRow> = {}): WbRow => ({
  key: 'sf-1', type: 'file', person_id: P1, kind: 'lab', doc_id: DOC, doc_date: '2024-03-05', created_at: '2025-01-01T00:00:00Z', page: 1, ext: 'pdf', sha256: 'a'.repeat(64), ...o
})
const none = () => false

describe('destName', () => {
  it('builds year folder, date, kind, doc id8, page and extension, no person name', () => {
    expect(destName(row())).toBe(join('From Bantay', '2024', '2024-03-05_lab_abcdef12_p01.pdf'))
    expect(destName(row({ type: 'labs' }))).toBe(join('From Bantay', '2024', '2024-03-05_lab_abcdef12_labs.csv'))
  })
  it('falls back to the created day in Manila time (23:30 UTC is already next day)', () => {
    expect(destName(row({ doc_date: null, created_at: '2025-01-01T23:30:00Z' }))).toBe(join('From Bantay', '2025', '2025-01-02_lab_abcdef12_p01.pdf'))
  })
})

describe('planWrites', () => {
  it('writes a new file into the person folder', () => {
    expect(planWrites([row()], {}, MAP, none)).toEqual([{ key: 'sf-1', action: 'write', dest: join(FOLDER, 'From Bantay', '2024', '2024-03-05_lab_abcdef12_p01.pdf') }])
  })
  it('skips when the manifest holds the same sha256, even if the file is gone', () => {
    const m = { 'sf-1': { dest: 'x', sha256: 'a'.repeat(64) } }
    expect(planWrites([row()], m, MAP, none)[0]).toMatchObject({ action: 'skip', dest: 'x' })
  })
  it('never overwrites: an existing file gives a -2 write, and two rows with one name get -2 and -3', () => {
    const dest = join(FOLDER, 'From Bantay', '2024', '2024-03-05_lab_abcdef12_p01.pdf')
    const r = planWrites([row()], {}, MAP, (p) => p === dest)[0]
    expect(r).toEqual({ key: 'sf-1', action: 'conflict', dest: dest.replace('_p01.pdf', '_p01-2.pdf') })
    const two = planWrites([row(), row({ key: 'sf-2' })], {}, MAP, (p) => p === dest)
    expect(two.map((x) => x.dest?.slice(-9))).toEqual(['p01-2.pdf', 'p01-3.pdf'])
  })
  it('a changed sha for a manifest key is a new write, not a skip', () => {
    const m = { 'sf-1': { dest: 'x', sha256: 'b'.repeat(64) } }
    expect(planWrites([row()], m, MAP, none)[0].action).toBe('write')
  })
  it('unmapped person gives unmapped', () => {
    expect(planWrites([row({ person_id: '99999999-9999-4999-8999-999999999999' })], {}, MAP, none)).toEqual([{ key: 'sf-1', action: 'unmapped' }])
  })
  it('a kind or extension that could leave the folder is bad_dest', () => {
    expect(planWrites([row({ kind: '../x' })], {}, MAP, none)[0].action).toBe('bad_dest')
    expect(planWrites([row({ ext: '/../e' })], {}, MAP, none)[0].action).toBe('bad_dest')
    expect(planWrites([row({ doc_id: '../../..' })], {}, MAP, none)[0].action).toBe('bad_dest')
  })
  it('id_card and insurance_card give no action; other kinds do', () => {
    const out = planWrites([row({ kind: 'id_card', key: 'a' }), row({ kind: 'insurance_card', key: 'b' }), row({ kind: 'prescription', key: 'c' })], {}, MAP, none)
    expect(out.map((x) => x.key)).toEqual(['c'])
  })
})

describe('labsCsv', () => {
  it('writes the header, quotes commas, quotes and newlines, and leaves null empty', () => {
    const csv = labsCsv([
      { name_raw: 'Test, A "x"', value_num: 5.2, value_text: null, unit_raw: 'mg/dL', ref_text: '3-5', flag: 'H', ref_low: 3, ref_high: 5, collected_at: '2024-03-05T01:00:00Z' },
      { name_raw: 'Line\nbreak', value_num: null, value_text: 'trace', unit_raw: null, ref_text: null, flag: null, ref_low: null, ref_high: null, collected_at: null }
    ])
    expect(csv).toBe(
      'name_raw,value_num,value_text,unit_raw,ref_text,flag,ref_low,ref_high,collected_at\r\n' +
        '"Test, A ""x""",5.2,,mg/dL,3-5,H,3,5,2024-03-05T01:00:00Z\r\n' +
        '"Line\nbreak",,trace,,,,,,\r\n'
    )
  })
})

describe('labsCsv formula cells', () => {
  it('prefixes a quote on text cells starting with = + - @ tab or CR, never on numbers', () => {
    const csv = labsCsv([{ name_raw: '=SUM(A1)', value_num: -2, value_text: '+1', unit_raw: '@x', ref_text: '-5', flag: null, ref_low: null, ref_high: null, collected_at: null }])
    expect(csv.split('\r\n')[1]).toBe("'=SUM(A1),-2,'+1,'@x,'-5,,,,")
    const t = labsCsv([{ name_raw: '\tx', value_text: '\rx' }])
    expect(t).toContain("'\tx")
    expect(t).toContain("'\rx")
  })
})

describe('apply and undo', () => {
  const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
  const tmp = () => mkdtempSync(join(tmpdir(), 'wbtest-'))
  const plan = (dest: string, data: Buffer, key = 'k1') => ({ key, action: 'write', type: 'file', dest, sha256: sha(data) })
  const setup = (data: Buffer, key = 'k1') => {
    const d = tmp()
    mkdirSync(join(d, 'src'))
    writeFileSync(join(d, 'src', key), data)
    return d
  }
  it('does not copy when the downloaded bytes do not match the sha', () => {
    const d = setup(Buffer.from('abc'))
    const dest = join(d, 'From Bantay', '2024', 'a.pdf')
    const p = { ...plan(dest, Buffer.from('abc')), sha256: 'f'.repeat(64) }
    expect(applyPlan([p], {}, true, join(d, 'src'))).toMatchObject({ written: 0, sha_mismatch: 1 })
    expect(existsSync(dest)).toBe(false)
    rmSync(d, { recursive: true })
  })
  it('never overwrites a file that exists at the destination', () => {
    const d = setup(Buffer.from('abc'))
    const dest = join(d, 'From Bantay', '2024', 'a.pdf')
    mkdirSync(join(d, 'From Bantay', '2024'), { recursive: true })
    writeFileSync(dest, 'owner edit')
    const m = {}
    expect(applyPlan([plan(dest, Buffer.from('abc'))], m, true, join(d, 'src'))).toMatchObject({ written: 0, failed: 1 })
    expect(readFileSync(dest, 'utf8')).toBe('owner edit')
    expect(m).toEqual({})
    rmSync(d, { recursive: true })
  })
  it('keeps the earlier manifest entry as key#oldSha when the sha changes', () => {
    const d = setup(Buffer.from('new'))
    const dest = join(d, 'From Bantay', '2024', 'b.pdf')
    const m: Record<string, { dest: string; sha256: string }> = { k1: { dest: 'old.pdf', sha256: 'e'.repeat(64) } }
    expect(applyPlan([plan(dest, Buffer.from('new'))], m, true, join(d, 'src')).written).toBe(1)
    expect(m['k1#' + 'e'.repeat(64)]).toEqual({ dest: 'old.pdf', sha256: 'e'.repeat(64) })
    expect(m.k1.sha256).toBe(sha('new'))
    rmSync(d, { recursive: true })
  })
  it('undo removes unchanged files inside From Bantay and keeps changed ones and ones outside it', () => {
    const d = tmp()
    mkdirSync(join(d, 'From Bantay'))
    const same = join(d, 'From Bantay', 'same.pdf')
    const edited = join(d, 'From Bantay', 'edited.pdf')
    const outside = join(d, 'outside.pdf')
    writeFileSync(same, 'one')
    writeFileSync(edited, 'two edited')
    writeFileSync(outside, 'three')
    const m = { a: { dest: same, sha256: sha('one') }, b: { dest: edited, sha256: sha('two') }, c: { dest: outside, sha256: sha('three') }, d: { dest: join(d, 'From Bantay', 'gone.pdf'), sha256: 'x' } }
    expect(undoManifest(m, false)).toEqual({ removed: 0, would_remove: 1, already_gone: 1, changed: 2, failed: 0 })
    expect(existsSync(same)).toBe(true)
    expect(undoManifest(m, true)).toEqual({ removed: 1, would_remove: 0, already_gone: 1, changed: 2, failed: 0 })
    expect(existsSync(same)).toBe(false)
    expect(existsSync(edited) && existsSync(outside)).toBe(true)
    expect(Object.keys(m)).toEqual(['b', 'c'])
    rmSync(d, { recursive: true })
  })
})

describe('planWrites root and buildMap duplicates', () => {
  it('a mapped folder outside --root is bad_dest', () => {
    expect(planWrites([row()], {}, MAP, none, join('/other', 'root'))[0].action).toBe('bad_dest')
    expect(planWrites([row()], {}, MAP, none, '/maps')[0].action).toBe('write')
  })
  it('duplicate display names and case-colliding folders stay unmapped', () => {
    const r1 = buildMap([{ id: 'a', display_name: 'Test Dup' }, { id: 'b', display_name: 'test dup' }, { id: 'c', display_name: 'Test Solo' }], ['Test Dup', 'Test Solo'], '/r')
    expect(r1).toEqual({ map: { c: join('/r', 'Test Solo') }, missing: 2 })
    const r2 = buildMap([{ id: 'a', display_name: 'Test Case' }], ['Test Case', 'test case'], '/r')
    expect(r2).toEqual({ map: {}, missing: 1 })
  })
})

describe('buildRows and buildMap', () => {
  it('numbers pages per document, takes the extension from the storage path, adds one labs row per document', () => {
    const f = (sf_id: string, p: string) => ({ sf_id, person_id: P1, kind: 'lab', doc_id: DOC, doc_date: '2024-03-05', created_at: '2025-01-01T00:00:00Z', storage_path: p, sha256: 'a'.repeat(64) })
    const rows = buildRows([f('s1', `${P1}/u1.PDF`), f('s2', `${P1}/u2.jpg`)], [{ doc_id: DOC, person_id: P1, kind: 'lab', doc_date: '2024-03-05', created_at: '2025-01-01T00:00:00Z', name_raw: 'T', value_num: 1 }])
    expect(rows.map((r) => [r.key, r.page, r.ext])).toEqual([['s1', 1, 'pdf'], ['s2', 2, 'jpg'], [`labs:${DOC}`, undefined, undefined]])
    expect(rows[2].sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('maps people to folders by display name, case-insensitive, and counts the rest', () => {
    const { map, missing } = buildMap([{ id: P1, display_name: 'Test Parent' }, { id: 'x', display_name: 'Nobody' }], ['test parent', 'Other'], '/root')
    expect(map).toEqual({ [P1]: join('/root', 'test parent') })
    expect(missing).toBe(1)
  })
})
