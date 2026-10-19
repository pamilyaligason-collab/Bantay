// @vitest-environment node
// Synthetic data only. No real names, values or ids anywhere in this file.
import { describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0008_records.sql?raw'
import catalogJson from '../../../scripts/import/test-catalog.json'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extractPdfText, hasRealText, normalizeDraft, pending, withRetry } from '../../../scripts/import/extract.mjs'
import { buildRequest, isSkipped, walk } from '../../../scripts/import/lib.mjs'
import { buildLoadSql, lit, readDrafts, uuid5 } from '../../../scripts/import/load.mjs'
import {
  buildPeopleIndex, matchTest, normalizeFlag, normalizeTest, normalizeUnit, parseCatalogSql, parseNumber, resolvePerson, toCanonical
} from '../../../scripts/import/normalize.mjs'
import { carryOver, markDuplicates, needsDownload, skipReason, toEntry } from '../../../scripts/import/sync.mjs'

const PID = '11111111-1111-4111-8111-111111111111'
const PID2 = '22222222-2222-4222-8222-222222222222'

describe('catalog', () => {
  it('test-catalog.json mirrors the 0008 seed exactly', () => {
    const fromSql = parseCatalogSql(migration)
    expect(fromSql.length).toBe(19)
    expect(catalogJson).toEqual(fromSql)
  })
  it('maps names and refuses differentials', () => {
    expect(matchTest('Fasting Blood Sugar')).toBe('fasting_glucose')
    expect(matchTest('  HGB ')).toBe('hemoglobin')
    expect(matchTest('Neutrophils')).toBeNull()
    expect(matchTest('Made Up Test')).toBeNull()
  })
})

describe('units and numbers', () => {
  it('normalises unit spellings', () => {
    expect(normalizeUnit('mg/dl')).toBe('mg/dL')
    expect(normalizeUnit('UMOL/L')).toBe('umol/L')
    expect(normalizeUnit('µmol/L')).toBe('umol/L')
    expect(normalizeUnit('x10^9/L')).toBe('x10^9/L')
    expect(normalizeUnit('10^9/L')).toBe('x10^9/L')
    expect(normalizeUnit('x 10^3/uL')).toBe('x10^9/L')
    expect(normalizeUnit('IU/L')).toBe('IU/L')
    expect(normalizeUnit('furlongs')).toBeNull()
  })
  it('converts only when safe', () => {
    expect(toCanonical(5, 'mmol/L', 'fasting_glucose')).toBeCloseTo(90.08, 2)
    expect(toCanonical(100, 'umol/L', 'creatinine')).toBeCloseTo(1.1312, 3)
    expect(toCanonical(40, 'IU/L', 'alt')).toBe(40)
    expect(toCanonical(14, 'g/dL', 'hemoglobin')).toBe(140)
    expect(toCanonical(45, '%', 'hematocrit')).toBeCloseTo(0.45, 6)
    expect(toCanonical(6, '10^9/L', 'wbc')).toBe(6)
    expect(toCanonical(5, 'mg/dL', 'wbc')).toBeNull()
    expect(toCanonical(5, null, 'wbc')).toBeNull()
    expect(toCanonical(40, 'mmol/mol', 'hba1c')).toBeNull()
  })
  it('parses numbers and keeps comparators as text', () => {
    expect(parseNumber('1,234.5')).toEqual({ value_num: 1234.5, value_text: null })
    expect(parseNumber('<5')).toEqual({ value_num: null, value_text: '<5' })
    expect(parseNumber('>90')).toEqual({ value_num: null, value_text: '>90' })
    expect(parseNumber('negative')).toEqual({ value_num: null, value_text: 'negative' })
    expect(parseNumber('5,2')).toEqual({ value_num: null, value_text: '5,2' })
    expect(parseNumber(7)).toEqual({ value_num: 7, value_text: null })
    expect(parseNumber(null)).toEqual({ value_num: null, value_text: null })
  })
  it('normalises flags', () => {
    expect(['H', 'High', '↑', 'l', 'LOW', '↓', 'Normal', 'abnormal', 'zz'].map(normalizeFlag)).toEqual(['H', 'H', 'H', 'L', 'L', 'L', 'N', 'A', null])
  })
  it('normalizeTest codes a known test and leaves an unknown one raw', () => {
    const a = normalizeTest({ name: 'Creatinine', value: '88', unit: 'umol/L', flag: 'H', ref_low: '53', ref_high: '97' })
    expect(a).toMatchObject({ test_code: 'creatinine', value_num: 88, flag: 'H', ref_low: 53, ref_high: 97 })
    expect(a.value_canonical).toBeCloseTo(0.99546, 4)
    const b = normalizeTest({ name: 'Mystery', value: '3', unit: 'u' })
    expect(b).toMatchObject({ test_code: null, value_canonical: null, value_num: 3 })
  })
})

describe('people', () => {
  const idx = buildPeopleIndex({ 'Test Person': PID, 'other, person': PID2 })
  it('resolves by folder or printed name, either order', () => {
    expect(resolvePerson(idx, { folder: 'test person' })).toBe(PID)
    expect(resolvePerson(idx, { folder: 'Unknown', printed: 'Person, Test' })).toBe(PID)
    expect(resolvePerson(idx, { printed: 'Person Other' })).toBe(PID2)
  })
  it('unknown or conflicting stays null (B-5)', () => {
    expect(resolvePerson(idx, { folder: 'Nobody' })).toBeNull()
    expect(resolvePerson(idx, { folder: 'Test Person', printed: 'Other Person' })).toBeNull()
  })
  it('rejects a bad id without echoing it', () => {
    expect(() => buildPeopleIndex({ a: 'not-a-uuid' })).toThrow('invalid id')
  })
})

describe('skip rules', () => {
  it('SKIP_RE now holds only picasa; the rest is classified by lane', () => {
    expect(isSkipped(['Test Person', '.picasaoriginals'])).toBe(true)
    for (const s of ['Passport', 'Land Title', 'Lot 5 Papers', 'Funds', 'Authorization Letter', 'Baptismal Cert', 'Birth Certificate', 'Visa', 'ID', '2024.01.01 Laboratory']) {
      expect(isSkipped(['Test Person', s])).toBe(false)
    }
  })
  it('counts skipped folders and files in walk', async () => {
    const tree: Record<string, { id: string; name: string; mime: string }[]> = {
      root: [
        { id: 'p', name: 'Test Person', mime: 'application/vnd.google-apps.folder' }
      ],
      p: [
        { id: 'a', name: '.picasaoriginals', mime: 'application/vnd.google-apps.folder' },
        { id: 'f', name: 'visa copy.jpg', mime: 'image/jpeg' },
        { id: 'g', name: 'lab.pdf', mime: 'application/pdf' }
      ],
      a: [{ id: 'x', name: 'scan.jpg', mime: 'image/jpeg' }]
    }
    let skipped = 0
    const rows = await walk(async (id: string) => tree[id], 'root', [], () => skipped++)
    expect(rows.map((r) => r.file_id)).toEqual(['f', 'g'])
    expect(rows.map((r) => r.lane)).toEqual(['document_only', 'health'])
    expect(skipped).toBe(1)
  })
  it('skips zero-byte, ini, picasa and non-doc google types', () => {
    const base = { name: 'a.pdf', path: 'P/a.pdf', mime: 'application/pdf', size: '10' }
    expect(skipReason(base)).toBeNull()
    expect(skipReason({ ...base, size: '0' })).toBe('zero_byte')
    expect(skipReason({ ...base, name: 'desktop.ini' })).toBe('ini')
    expect(skipReason({ ...base, path: 'P/.picasaoriginals/a.pdf' })).toBe('picasa')
    expect(skipReason({ ...base, mime: 'application/vnd.google-apps.spreadsheet', size: null })).toBe('google_apps_type')
    expect(skipReason({ ...base, mime: 'application/vnd.google-apps.document', size: null })).toBeNull()
  })
})

describe('sync logic', () => {
  const e = (id: string, modified: string, sha: string | undefined, skipped: string | null = null) =>
    ({ drive_file_id: id, name: id, mime: 'application/pdf', size: 1, modified, md5: null, path: `P/${id}`, person_folder: 'P', kind_guess: 'other', date_guess: '', skipped, sha256: sha })
  it('person folder is the first segment, empty at root', () => {
    expect(toEntry({ file_id: 'a', name: 'a.pdf', mime: 'application/pdf', path: 'Test Person/x/a.pdf', size: '5', modified: 't' }).person_folder).toBe('Test Person')
    expect(toEntry({ file_id: 'a', name: 'a.pdf', mime: 'application/pdf', path: 'a.pdf', size: '5', modified: 't' }).person_folder).toBe('')
  })
  it('incremental: unchanged files are not downloaded again', () => {
    const cur = e('a', 't1', undefined)
    expect(needsDownload(cur, undefined, false)).toBe(true)
    expect(needsDownload(cur, e('a', 't1', 'h'), true)).toBe(false)
    expect(needsDownload(cur, e('a', 't0', 'h'), true)).toBe(true)
    expect(needsDownload(cur, e('a', 't1', 'h'), false)).toBe(true)
    expect(needsDownload(e('a', 't1', undefined, 'ini'), undefined, false)).toBe(false)
  })
  it('dedupe keeps the oldest and skips skipped files', () => {
    const h = 'a'.repeat(64)
    const list = markDuplicates([e('b', '2024-02-01', h), e('a', '2024-01-01', h), e('c', '2024-03-01', h, 'zero_byte'), e('d', '2024-01-01', 'f'.repeat(64))])
    expect(list.map((x) => x.duplicate_of)).toEqual(['a', null, null, null])
  })
})

describe('extract helpers', () => {
  it('detects a real text layer', () => {
    expect(hasRealText('')).toBe(false)
    expect(hasRealText('  \n 1 ')).toBe(false)
    expect(hasRealText('Sample laboratory report line. '.repeat(10))).toBe(true)
  })
  it('text mode sends text, keeps zdr and refuses free models', () => {
    const b = buildRequest({ model: 'v/m', fallbackModel: 'v/n', mime: 'application/pdf', text: 'hello' })
    expect(b.provider).toEqual({ zdr: true, data_collection: 'deny' })
    expect(JSON.stringify(b.messages)).not.toContain('"file"')
    expect(() => buildRequest({ model: 'v/m:free', fallbackModel: 'v/n', mime: 'image/png', base64: 'AA' })).toThrow(/paid/)
  })
  it('retries 429/5xx with backoff, not 4xx', async () => {
    const sleepFn = vi.fn(async (_ms: number) => {})
    let n = 0
    const out = await withRetry(async () => { if (n++ < 2) throw Object.assign(new Error('x'), { status: n === 1 ? 429 : 503 }); return 'ok' }, { sleepFn })
    expect(out).toBe('ok')
    expect(sleepFn.mock.calls.map((c) => c[0])).toEqual([2000, 4000])
    await expect(withRetry(async () => { throw Object.assign(new Error('x'), { status: 400 }) }, { sleepFn })).rejects.toThrow()
    expect(sleepFn).toHaveBeenCalledTimes(2)
  })
  it('normalizeDraft keeps the contract shape only', () => {
    const d = normalizeDraft({ doc_kind: 'nonsense', tests: 'bad', extra: 1, confidence: 7 })
    expect(d).toMatchObject({ doc_kind: 'other', tests: [], rx: null, confidence: null })
    expect('extra' in d).toBe(false)
  })
  it('pending skips drafted, skipped, duplicate and missing files', () => {
    const m = { files: [e2('a'), e2('b'), e2('c', { skipped: 'ini' }), e2('d', { duplicate_of: 'a' }), e2('e')] }
    expect(pending(m as never, (id) => id === 'b', (id) => id !== 'e').map((x) => x.drive_file_id)).toEqual(['a'])
  })
})
function e2(id: string, extra: Record<string, unknown> = {}) {
  return { drive_file_id: id, skipped: null, duplicate_of: null, ...extra }
}

describe('load.sql', () => {
  const manifest = {
    files: [
      { drive_file_id: 'f2', name: "O'Brien $$ x.pdf", mime: 'application/pdf', size: 5, modified: '2024-02-01T00:00:00Z', md5: null, sha256: 'a'.repeat(64), person_folder: 'Test Person', skipped: null, duplicate_of: 'f1' },
      { drive_file_id: 'f1', name: 'lab.pdf', mime: 'application/pdf', size: 5, modified: '2024-01-01T00:00:00Z', md5: null, sha256: 'a'.repeat(64), person_folder: 'Test Person', skipped: null, duplicate_of: null },
      { drive_file_id: 'f3', name: 'z.ini', mime: 'text/plain', size: 5, modified: null, person_folder: 'Test Person', skipped: 'ini', duplicate_of: null },
      { drive_file_id: 'f4', name: 'who.jpg', mime: 'image/jpeg', size: 5, modified: null, person_folder: 'Stranger', skipped: null, duplicate_of: null },
      { drive_file_id: 'f5', name: 'rx.jpg', mime: 'image/jpeg', size: 5, modified: null, person_folder: 'Test Person', skipped: null, duplicate_of: null }
    ]
  }
  const labDraft = {
    doc_kind: 'lab', doc_date: '2024-01-01', collected_at: '2024-01-01T08:00:00+08:00', facility: "Test 'Lab' $$", patient_name_as_printed: 'Test Person',
    tests: [
      { panel: 'Chem', name: 'Creatinine', value: '1.0', unit: 'mg/dl', flag: 'N', ref_low: '0.6', ref_high: '1.2' },
      { panel: 'Chem', name: "Weird 'test' $$ \\ x", value: '<5', unit: null },
      { name: 'Empty', value: null }
    ],
    confidence: 0.9
  }
  const drafts = {
    f1: labDraft,
    f2: labDraft,
    f4: { doc_kind: 'lab', patient_name_as_printed: 'Nobody', tests: [{ name: 'Creatinine', value: '1' }] },
    f5: { doc_kind: 'prescription', patient_name_as_printed: null, rx: { date: '2024-03-01', lines: [{ line_no: 1, drug: 'Drug A', unclear: true, bbox: { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }, { line_no: 1, drug: 'Drug B' }] } }
  }
  const run = () => buildLoadSql({ manifest, drafts, peopleMap: { 'test person': PID } })

  it('is deterministic and idempotent-shaped', () => {
    expect(run().sql).toBe(run().sql)
    expect(uuid5('x')).toBe(uuid5('x'))
    expect(uuid5('x')).not.toBe(uuid5('y'))
    expect(uuid5('sf:f1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const { sql } = run()
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    for (const l of sql.split('\n').filter((x) => x.startsWith('insert into'))) {
      expect(l).toMatch(/on conflict \((id|drive_file_id)\) do (nothing|update)/)
    }
    expect(sql).toContain('on conflict (drive_file_id) do update set drive_modified_at')
  })
  it('never writes anything but drafts', () => {
    const { sql } = run()
    expect(sql).not.toMatch(/'confirmed'/)
    expect(sql).not.toMatch(/'rejected'/)
    expect(sql).not.toMatch(/confirmed_(by|at)/)
    expect(sql).toContain("'draft'")
  })
  it('escapes quotes and $$ in values', () => {
    expect(lit("a'b $$ c\\d\0")).toBe("'a''b $$ c\\d'")
    const { sql } = run()
    expect(sql).toContain("'Weird ''test'' $$ \\ x'")
    expect(sql).toContain("'Test ''Lab'' $$'")
    expect(sql).toContain("'O''Brien $$ x.pdf'")
  })
  it('duplicates and skipped files get no health rows; keeper comes first', () => {
    const { sql, summary } = run()
    expect(sql.match(/insert into public\.documents/g)).toHaveLength(2) // f1 and f5 only
    expect(sql.indexOf(`'${uuid5('sf:f1')}', '`)).toBeLessThan(sql.indexOf(`'${uuid5('sf:f2')}', '`))
    expect(sql).toContain(`'${uuid5('sf:f1')}'`)
    expect(summary.by_status).toEqual({ skipped: 2, queued: 3 })
    expect(sql).toContain("'duplicate'")
    expect(sql).toContain("'ini'")
  })
  it('unknown person goes to the unassigned queue with no health rows', () => {
    const { sql, summary } = run()
    expect(summary.unassigned_files).toBe(1)
    const sf = sql.split('\n').find((l) => l.includes("'f4'"))!
    expect(sf).toMatch(/values \('[^']+', null, 'f4'/)
    expect(sql.match(/insert into public\.lab_results/g)).toHaveLength(2)
  })
  it('maps tests, panels, rx lines and unique line numbers', () => {
    const { sql, summary } = run()
    expect(sql.match(/insert into public\.lab_panels/g)).toHaveLength(1)
    expect(sql).toContain("'creatinine'")
    expect(sql).toContain("'<5'")
    expect(summary.rows).toMatchObject({ documents: 2, lab_results: 2, lab_panels: 1, prescriptions: 1, prescription_items: 2 })
    const items = sql.split('\n').filter((l) => l.startsWith('insert into public.prescription_items'))
    expect(items[0]).toContain('true')
    expect(items[1]).toMatch(/, 2, 'Drug B'/)
    expect(items[0]).toContain('::jsonb')
  })
  it('summary has counts only, no names', () => {
    const s = JSON.stringify(run().summary)
    expect(s).not.toMatch(/Test Person|Stranger|f1|f2/)
    expect(Object.keys(run().summary.by_person_index).sort()).toEqual(['p1', 'p2'])
  })
})

/** Smallest valid one-page PDF with a text layer, offsets computed. Synthetic text only. */
function tinyPdf(text: string) {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

describe('fix round', () => {
  it('extractPdfText reads a synthetic text layer (pdfjs 6, task.destroy)', async () => {
    const t = await extractPdfText(tinyPdf('Synthetic sample line'))
    expect(t).toContain('Synthetic sample line')
  }, 60_000) // first pdfjs load is slow on a busy PC
  it('a corrupt draft is counted and its content never reaches the log', () => {
    const dir = mkdtempSync(`${tmpdir()}/drafts-`)
    try {
      writeFileSync(`${dir}/bad.json`, '{"patient": "MARKER_ZZ_9" oops')
      writeFileSync(`${dir}/ok.json`, '{"doc_kind":"lab"}')
      const spy = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
      const r = readDrafts(dir)
      expect(r.corrupt).toBe(1)
      expect(Object.keys(r.drafts)).toEqual(['ok'])
      expect(JSON.stringify(spy.map((s) => s.mock.calls))).not.toContain('MARKER_ZZ_9')
      spy.forEach((s) => s.mockRestore())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('unchanged files keep stored_mime and sha256', () => {
    const out = carryOver({ drive_file_id: 'a' } as never, { sha256: 'h', stored_mime: 'application/pdf' } as never) as unknown as { sha256: string; stored_mime: string }
    expect(out).toMatchObject({ sha256: 'h', stored_mime: 'application/pdf' })
  })
  const mk = (id: string, folder: string, extra = {}) => ({ drive_file_id: id, name: `${id}.pdf`, mime: 'application/pdf', size: 1, modified: null, person_folder: folder, skipped: null, duplicate_of: null, ...extra })
  it('zone-less timestamps are Manila time; NUL is stripped from json', () => {
    const d = { doc_kind: 'prescription', doc_date: '2024-01-01', collected_at: '2024-01-01 08:00', released_at: '2024-01-02', rx: { date: '2024-01-01', lines: [{ drug: 'X', bbox: { note: 'a\u0000b' } }] } }
    const { sql } = buildLoadSql({ manifest: { files: [mk('g1', 'Test Person')] }, drafts: { g1: d }, peopleMap: { 'test person': PID } })
    expect(sql).toContain("'2024-01-01T08:00+08:00'")
    expect(sql).toContain("'2024-01-02T00:00:00+08:00'")
    expect(sql).not.toContain('u0000')
    expect(sql).toContain('ab')
  })
  it('remap_needed: a changed map never pairs an existing person with another person document', () => {
    const drafts = { g1: { doc_kind: 'lab', tests: [{ name: 'Creatinine', value: '1' }] } }
    const { sql, summary, persons } = buildLoadSql({ manifest: { files: [mk('g1', 'Test Person')] }, drafts, peopleMap: { 'test person': PID }, prevPersons: { g1: PID2 } })
    expect(summary.remap_needed).toBe(1)
    expect(sql).not.toContain('insert into public.documents')
    expect(sql).not.toContain('insert into public.lab_results')
    expect(persons.g1).toBe(PID2)
    expect(sql).toContain(`'${PID2}'`)
    expect(sql).not.toContain(`'${PID}'`)
  })
  it('a duplicate in another person folder is left unassigned (person_mismatch)', () => {
    const files = [mk('k1', 'Test Person'), mk('k2', 'Other Person', { duplicate_of: 'k1' })]
    const { sql } = buildLoadSql({ manifest: { files }, drafts: { k1: { doc_kind: 'other' } }, peopleMap: { 'test person': PID, 'other person': PID2 } })
    const dup = sql.split('\n').find((l) => l.includes("'k2'"))!
    expect(dup).toMatch(/values \('[^']+', null, 'k2'/)
  })
})

describe('local Drive-for-desktop sync', () => {
  it('maps person/year/title to the copied Drive id and leaves the rest unmatched', async () => {
    const { idsFromCopyLog } = await import('../../../scripts/import/sync.mjs')
    const jobs = [{ src: 's1', folder: ['Test Person', '2024'], title: '2024-01-02 Lab.pdf' }, { src: 's2', folder: ['Test Person', 'Undated'], title: 'x.jpg' }]
    const log = [{ src: 's1', new_id: 'n1', status: 'copied' }, { src: 's2', new_id: 'n2', status: 'error' }]
    const m = idsFromCopyLog(jobs, log)
    expect(m.get('Test Person/2024/2024-01-02 Lab.pdf')).toBe('n1')
    expect(m.has('Test Person/Undated/x.jpg')).toBe(false)
  })
})
