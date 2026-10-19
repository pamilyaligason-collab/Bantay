// @vitest-environment node
// Synthetic data only. No real names, values or ids anywhere in this file.
import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/0013_records_autoconfirm.sql?raw'
import { assignedTo, normalizeDraft, normalizeIdentity, pending } from '../../../scripts/import/extract.mjs'
import {
  AUTO_THRESHOLD, buildMatcher, buildPeopleMap, buildProfiles, dependentsSql, extractPeopleRows, gate, matchPerson, parseAliasConfig, pickField, resolveThreshold
} from '../../../scripts/import/family.mjs'
import { classifyPath, promptFor } from '../../../scripts/import/folders.mjs'
import { buildLoadSql, uuid5 } from '../../../scripts/import/load.mjs'
import { dryRunCounts, localPathId, needsDownload, toEntry } from '../../../scripts/import/sync.mjs'

const PA = '11111111-1111-4111-8111-111111111111'
const PB = '22222222-2222-4222-8222-222222222222'
const MAP = { 'Test Parent': PA, 'Test Parent Sr': PA, 'Test Almendras': PA, 'Test Mandras': PA, 'Test Relative': PB }

describe('lane classification', () => {
  const lane = (...s: string[]) => classifyPath(s).lane
  it('classifies each family folder', () => {
    const root = '4.2 Family Files'
    expect(lane(root, '- Medical Files and Lab Results', 'Test Parent', '2024.01.01 Laboratory', 'a.pdf')).toBe('health')
    expect(lane(root, '- IDs and Documents', '1. Test Parent', 'card.jpg')).toBe('identity')
    expect(lane(root, '- Insurance', 'plan.pdf')).toBe('insurance')
    expect(lane(root, '- IDs and Documents', 'Test Parent', '- HMO', 'card.jpg')).toBe('insurance')
    expect(lane(root, '- Home Lot Documents', '20240219 Property and Land Tax Payment', 'a.pdf')).toBe('document_only')
    expect(lane('2026.09 US Visa Application', '2 copies', 'a.jpg')).toBe('document_only')
    expect(lane(root, 'Test Relative', 'scan.jpg')).toBe('health') // a person folder with no hint is health
  })
  it('document_only wins over identity: a passport inside the visa folder is never read', () => {
    expect(lane('2026.09 US Visa Application', 'Passport', 'a.jpg')).toBe('document_only')
  })
  it('folder names decide before the file name; the file name decides when no folder does', () => {
    expect(lane('Test Parent', '2024.01.01 Laboratory', 'Birth Cert - X.pdf')).toBe('identity') // no folder rule: the file name decides
    expect(lane('Visa', 'Birth Cert - X.pdf')).toBe('document_only') // a folder rule beats the file name
    expect(lane('Test Parent', 'Birth Cert - X.pdf')).toBe('identity')
    expect(lane('Test Parent', 'Funds letter.pdf')).toBe('document_only')
  })
  it('skips picasa only; desktop.ini is a file-level skip in sync', () => {
    expect(classifyPath(['P', '.picasaoriginals', 'a.jpg'])).toEqual({ lane: null, skip: 'picasa' })
    expect(classifyPath(['P', 'desktop.ini']).skip).toBeNull()
  })
  it('maps lanes to prompts; document_only gets none', () => {
    expect([promptFor('health'), promptFor('identity'), promptFor('insurance'), promptFor('document_only')]).toEqual(['health', 'identity', 'identity', null])
  })
  it('toEntry carries the lane; document_only is never downloaded or extracted', () => {
    const row = { file_id: 'x1', name: 'a.pdf', mime: 'application/pdf', size: '5', modified: null, md5: null, path: 'Visa/a.pdf', type: 'other', date: '' }
    const e = toEntry(row)
    expect(e.lane).toBe('document_only')
    expect(needsDownload(e, undefined, false)).toBe(false)
    expect(needsDownload(toEntry({ ...row, path: 'P/Lab/a.pdf' }), undefined, false)).toBe(true)
    const m = { files: [e, { ...e, drive_file_id: 'y', lane: 'identity' }] }
    expect(pending(m as never, () => false, () => true).map((x) => x.drive_file_id)).toEqual(['y'])
  })
  it('path ids hide names and are stable', () => {
    expect(localPathId('A/b.pdf')).toMatch(/^local:[0-9a-f]{32}$/)
    expect(localPathId('A/b.pdf')).toBe(localPathId('A/b.pdf'))
    expect(localPathId('A/b.pdf')).not.toBe(localPathId('A/c.pdf'))
  })
})

describe('alias config and person matching', () => {
  const m = buildMatcher(MAP)
  it('rejects a bad config without echoing names', () => {
    expect(() => parseAliasConfig({ people: [] })).toThrow('people list')
    expect(() => parseAliasConfig({ people: [{ name: 'A One' }, { name: 'a one' }] })).toThrow('two people')
    expect(() => parseAliasConfig({ people: [{ aliases: [] }] })).toThrow('no name')
    expect(parseAliasConfig({ people: [{ name: ' A One ', aliases: ['Uno', ''], dependent: true }] }).people[0]).toEqual({ name: 'A One', aliases: ['Uno'], dependent: true })
  })
  it('both spellings of a folder name resolve to the same person, numbering stripped', () => {
    expect(matchPerson(m, { segments: ['- Medical', 'Test Almendras'], printed: null })).toEqual({ id: PA, strength: 'folder' })
    expect(matchPerson(m, { segments: ['- IDs', '3. Test Mandras'], printed: null })).toEqual({ id: PA, strength: 'folder' })
  })
  it('printed names: exact, reordered, with extra words; initials never count', () => {
    expect(matchPerson(m, { segments: ['Test Parent'], printed: 'PARENT, TEST' })).toEqual({ id: PA, strength: 'both' })
    expect(matchPerson(m, { segments: ['Test Parent'], printed: 'TEST ALMENDRAS PARENT L.' })).toEqual({ id: PA, strength: 'both' })
    expect(matchPerson(m, { segments: ['Test Parent'], printed: 'T. P.' })).toEqual({ id: PA, strength: 'weak' })
  })
  it('a conflict or two folder people gives no person', () => {
    expect(matchPerson(m, { segments: ['Test Parent'], printed: 'Test Relative' })).toEqual({ id: null, strength: 'conflict' })
    expect(matchPerson(m, { segments: ['Test Parent', 'Test Relative'], printed: null })).toEqual({ id: null, strength: 'conflict' })
  })
  it('an ambiguous printed name matches nobody; no folder match uses the printed name weakly', () => {
    const amb = buildMatcher({ 'Zed Quill': PA, 'Ann Quill': PB })
    expect(matchPerson(amb, { segments: ['Shared'], printed: 'Ann Zed Quill' })).toEqual({ id: null, strength: 'none' })
    expect(matchPerson(m, { segments: ['Shared'], printed: 'Test Relative' })).toEqual({ id: PB, strength: 'printed' })
    expect(matchPerson(m, { segments: ['Test Parent and Test Relative Documents'], printed: null })).toEqual({ id: null, strength: 'none' }) // shared folder
  })
  it('builds the people-map from database people; ambiguous and missing are counted', () => {
    const cfg = parseAliasConfig({ people: [{ name: 'Test Parent', aliases: ['Test Mandras'] }, { name: 'Test Relative' }, { name: 'Test Gone' }, { name: 'Twin One', aliases: ['Twin'] }] })
    const db = [{ id: PA.toUpperCase(), display_name: 'test mandras' }, { id: PB, display_name: 'Test Relative' }, { id: '33333333-3333-4333-8333-333333333333', display_name: 'Twin' }, { id: '44444444-4444-4444-8444-444444444444', display_name: 'Twin One' }]
    const r = buildPeopleMap(cfg, db)
    expect(r.map['Test Parent']).toBe(PA)
    expect(r.map['Test Mandras']).toBe(PA)
    expect(r.map['Test Relative']).toBe(PB)
    expect(r.missing).toEqual(['Test Gone'])
    expect(r.ambiguous).toBe(1)
  })
  it('finds people rows in any JSON shape', () => {
    expect(extractPeopleRows({ rows: [{ id: 'a', display_name: 'X' }], other: { deep: [[{ id: 'b', display_name: 'Y' }]] } })).toHaveLength(2)
  })
  it('dependents sql adds only dependents, names only, safe to re-run', () => {
    const sql = dependentsSql(parseAliasConfig({ people: [{ name: "Test O'Parent", aliases: ['Test Mandras'], dependent: true }, { name: 'Test Member' }] }))
    expect(sql).toContain("'Test O''Parent'")
    expect(sql).not.toContain('Test Member')
    expect(sql).toMatch(/insert into public\.people \(display_name, created_by\)/)
    expect(sql).toContain('on conflict (alias) do nothing')
    expect(sql).toContain("where r.role = 'admin'")
    expect(dependentsSql(parseAliasConfig({ people: [{ name: 'Test Member' }] }))).toContain('no dependents')
  })
})

describe('confidence gate', () => {
  it('confirms only a number at or above the threshold with a trusted match', () => {
    expect(gate({ strength: 'both', confidence: 0.9 })).toBe('confirmed')
    expect(gate({ strength: 'both', confidence: 0.89 })).toBe('draft')
    expect(gate({ strength: 'both', confidence: null })).toBe('draft')
    expect(gate({ strength: 'both', confidence: Number.NaN })).toBe('draft')
    expect(gate({ strength: 'folder', confidence: 0.99, lane: 'health' })).toBe('confirmed')
    expect(gate({ strength: 'folder', confidence: 0.99, lane: 'identity' })).toBe('draft')
    for (const s of ['weak', 'printed', 'conflict', 'none'] as const) expect(gate({ strength: s, confidence: 1 })).toBe('draft')
  })
  it('refuses a threshold the database would refuse, and matches the SQL floor', () => {
    expect(() => resolveThreshold(0.5)).toThrow('threshold')
    expect(() => gate({ strength: 'both', confidence: 1, threshold: 0.8 })).toThrow('threshold')
    expect(gate({ strength: 'both', confidence: 0.95, threshold: 0.95 })).toBe('confirmed')
    expect(Number(/select ([0-9.]+)::numeric/.exec(migration)![1])).toBe(AUTO_THRESHOLD)
  })
})

describe('profile merge', () => {
  it('normalises, picks the most confident value and drops ties and junk', () => {
    const p = buildProfiles([
      { personId: PA, fields: { birthdate: '1950-05-04', sex: 'F', blood_type: 'o positive', address: ' 1  Test St ' }, conf: 0.95 },
      { personId: PA, fields: { birthdate: '1950-05-04', sex: 'Female', blood_type: 'AB+', address: null }, conf: 0.92 },
      { personId: PB, fields: { birthdate: '1990-13-40', sex: 'x', blood_type: 'Z', address: '' }, conf: 0.99 }
    ])
    expect(p.get(PA)).toEqual({ birthdate: '1950-05-04', sex: 'female', blood_type: 'O+', address: '1 Test St' })
    expect(p.get(PB)).toEqual({})
    expect(pickField([{ value: 'A+', conf: 0.9 }, { value: 'B+', conf: 0.9 }])).toBeNull()
    expect(pickField([{ value: 'A+', conf: 0.9 }, { value: 'B+', conf: 0.95 }])).toBe('B+')
  })
  it('normalizeIdentity keeps the contract shape only and turns the string "null" into null', () => {
    const d = normalizeIdentity({ doc_kind: 'passport', holder_name_as_printed: ' Test Parent ', sex: 'null', extra: 1, confidence: 4 })
    expect(d).toMatchObject({ lane: 'identity', doc_kind: 'other', patient_name_as_printed: 'Test Parent', sex: null, confidence: null })
    expect('extra' in d).toBe(false)
  })
})

describe('extract: unknown confidence and unassigned files', () => {
  it('confidence null/missing stays null, never 0', () => {
    expect(normalizeIdentity({ confidence: null }).confidence).toBeNull()
    expect(normalizeDraft({ confidence: null }).confidence).toBeNull()
    expect(normalizeDraft({}).confidence).toBeNull()
    expect(normalizeDraft({ confidence: 0 }).confidence).toBe(0)
  })
  it('pending skips files whose person cannot be matched', () => {
    const m = { files: [{ drive_file_id: 'a', path: 'Test Parent/Lab/a.pdf' }, { drive_file_id: 'b', path: 'Nobody/Lab/b.pdf' }] }
    const ids = pending(m as never, () => false, () => true, assignedTo(buildMatcher(MAP) as never) as never).map((x) => x.drive_file_id)
    expect(ids).toEqual(['a'])
  })
})

describe('auto-confirm in the load sql', () => {
  const mk = (id: string, path: string, lane: string, extra: Record<string, unknown> = {}) => ({
    drive_file_id: id, name: path.split('/').pop(), mime: 'application/pdf', size: 10, modified: '2024-01-01T00:00:00Z', md5: null, path,
    person_folder: path.split('/')[0], lane, skipped: null, duplicate_of: null, ...extra
  })
  const lab = (c: number | null, printed: string | null = 'Test Parent', extra: Record<string, unknown> = {}) => ({
    doc_kind: 'lab', doc_date: '2024-01-01', patient_name_as_printed: printed, via: 'text', tests: [{ name: 'Creatinine', value: '1.0', unit: 'mg/dL' }], confidence: c, ...extra
  })
  const manifest = {
    files: [
      mk('hi', 'Root/Medical/Test Parent/a.pdf', 'health'),
      mk('low', 'Root/Medical/Test Parent/b.pdf', 'health'),
      mk('weak', 'Root/Medical/Test Parent/c.pdf', 'health'),
      mk('noname', 'Root/Medical/Test Parent/d.pdf', 'health'),
      mk('other', 'Root/Medical/Test Parent/e.pdf', 'health'),
      mk('vis', 'Root/Visa/f.pdf', 'document_only'),
      mk('idc', 'Root/IDs/1. Test Parent/g.jpg', 'identity'),
      mk('idc2', 'Root/IDs/Test Mandras/h.jpg', 'identity'),
      mk('ins', 'Root/Insurance/Test Parent/i.pdf', 'insurance'),
      mk('rx1', 'Root/Medical/Test Parent/j.pdf', 'health'),
      mk('rx2', 'Root/Medical/Test Parent/k.pdf', 'health'),
      mk('hw', 'Root/Medical/Test Parent/l.jpg', 'health')
    ]
  }
  const rx = (via: string, lines: object[]) => ({ doc_kind: 'prescription', patient_name_as_printed: 'Test Parent', via, confidence: 0.95, rx: { date: '2024-02-01', lines } })
  const drafts = {
    hi: lab(0.95, 'Test Parent', { allergies: ['Penicillin'], conditions: ['Hypertension'] }),
    low: lab(0.5),
    weak: lab(0.99, 'Someone Unknown'),
    noname: lab(0.95, null),
    other: lab(0.99, 'Test Relative'),
    idc: { lane: 'identity', doc_kind: 'id_card', card_type: 'philsys', patient_name_as_printed: 'Test Parent', birthdate: '1950-05-04', sex: 'female', blood_type: 'O+', address: '1 Test St', id_type: 'philsys', id_number: '9999-TEST', confidence: 0.96 },
    idc2: { lane: 'identity', doc_kind: 'id_card', patient_name_as_printed: 'Test Almendras', birthdate: '1950-05-04', sex: 'female', confidence: 0.93 },
    ins: { lane: 'identity', doc_kind: 'id_card', patient_name_as_printed: 'Test Parent', carrier: 'Test HMO', plan: 'Gold', id_type: 'hmo', id_number: 'MEM-0001', expires_on: '2027-01-01', confidence: 0.95 },
    rx1: rx('text', [{ line_no: 1, drug: 'Drug A' }, { line_no: 2, drug: 'Drug B', unclear: true }]),
    rx2: rx('text', [{ line_no: 1, drug: 'drug a' }]),
    hw: { ...rx('vision', [{ line_no: 1, drug: 'Drug C' }]) }
  }
  const run = (autoConfirm: { threshold?: number } | null = {}) => buildLoadSql({ manifest, drafts, peopleMap: MAP, autoConfirm })
  const line = (sql: string, table: string, needle: string) => sql.split('\n').find((l) => l.startsWith(`insert into public.${table} `) && l.includes(needle))!

  it('drafts-only mode (no autoConfirm) writes no confirmed rows at all', () => {
    const { sql, summary } = run(null)
    expect(sql).not.toMatch(/'confirmed'/)
    expect(sql).not.toMatch(/confirmed_source/)
    expect(sql).not.toMatch(/update public\.people/)
    expect(summary.mode).toBe('drafts_only')
  })
  it('confirms a high-confidence document matched by folder and printed name, with the auto marker', () => {
    const { sql } = run()
    const doc = line(sql, 'documents', `'${uuid5('doc:hi')}'`)
    expect(doc).toContain("'confirmed', 'auto'")
    expect(line(sql, 'lab_results', `'${uuid5('lab:hi:0')}'`)).toContain("'confirmed', 'auto'")
  })
  it('keeps low confidence, unrecognised printed name, no printed name on a lane that needs it, and other-person papers as drafts', () => {
    const { sql } = run()
    expect(line(sql, 'documents', `'${uuid5('doc:low')}'`)).toContain("'draft'")
    expect(line(sql, 'documents', `'${uuid5('doc:weak')}'`)).toContain("'draft'")
    expect(line(sql, 'documents', `'${uuid5('doc:noname')}'`)).toContain("'confirmed', 'auto'") // health + folder match + no printed name
    expect(sql).not.toContain(`'${uuid5('doc:other')}'`) // folder says one person, the paper another: unassigned, no rows
  })
  it('document_only files are registered for the person, never given rows, and counted as skipped', () => {
    const { sql, summary } = run()
    expect(sql).not.toContain(`'${uuid5('doc:vis')}'`)
    expect(line(sql, 'source_files', "'vis'")).toContain("'skipped', 'document_only'")
    expect(summary.by_lane.document_only).toBe(1)
  })
  it('handwriting (vision) and unclear lines are never auto-confirmed; a text-layer line is', () => {
    const { sql } = run()
    expect(line(sql, 'prescription_items', `'${uuid5('rxi:rx1:0')}'`)).toContain("'confirmed', 'auto'")
    expect(line(sql, 'prescription_items', `'${uuid5('rxi:rx1:1')}'`)).toContain("'draft'")
    expect(line(sql, 'prescription_items', `'${uuid5('rxi:hw:0')}'`)).toContain("'draft'")
    expect(line(sql, 'prescriptions', `'${uuid5('rx:hw')}'`)).toContain("'draft'")
  })
  it('identity papers: both spellings merge into one profile update; numbers go to person_identifiers after source_files', () => {
    const { sql, summary } = run()
    const upd = sql.split('\n').filter((l) => l.startsWith('update public.people'))
    expect(upd).toHaveLength(1)
    expect(upd[0]).toContain("birthdate = coalesce(birthdate, '1950-05-04'::date)")
    expect(upd[0]).toContain("sex = coalesce(sex, 'female')")
    expect(upd[0]).toContain("blood_type = coalesce(blood_type, 'O+')")
    expect(upd[0]).toContain("'Test Almendras'") // aliases union
    expect(upd[0]).not.toContain("'Test Parent'") // the person's own display name is not an alias
    expect(upd[0]).toContain("'Penicillin'") // confirmed allergy joins the profile list
    expect(upd[0]).toContain("'Drug A'") // seen on two papers = maintenance medicine
    expect(upd[0]).not.toContain('Drug B')
    expect(upd[0]).not.toContain('Drug C')
    expect(sql.indexOf('insert into public.person_identifiers')).toBeGreaterThan(sql.lastIndexOf('insert into public.source_files'))
    expect(sql.indexOf('insert into public.insurance_policies')).toBeGreaterThan(sql.lastIndexOf('insert into public.source_files'))
    expect(line(sql, 'person_identifiers', "'9999-TEST'")).toMatch(/on conflict do nothing;$/)
    expect(line(sql, 'insurance_policies', "'Gold'")).toContain("'Test HMO', 'Gold', null, '2027-01-01'")
    expect(sql).not.toMatch(/member_no/)
    expect(JSON.stringify(summary)).not.toMatch(/9999-TEST|MEM-0001|1 Test St/) // no values in the summary
    expect(summary.identifiers).toBe(2)
  })
  it('summary counts rows by status and files per person index, lane and status', () => {
    const { summary } = run()
    expect(summary.row_status.lab_results).toEqual({ confirmed: 2, draft: 2 }) // hi + noname confirmed; low + weak draft
    expect(Object.keys(summary.by_person).sort()).toEqual(['p1', 'unassigned'])
    expect(summary.by_person.p1.health.done).toBeGreaterThan(0)
    expect(summary.by_person.unassigned.health).toBeDefined()
  })
  it('is deterministic', () => {
    expect(run().sql).toBe(run().sql)
  })
  it('refuses a threshold below the database floor', () => {
    expect(() => run({ threshold: 0.5 })).toThrow('threshold')
  })
})

describe('dry run counts', () => {
  it('counts lanes, skips and person index without names', () => {
    const e = (path: string, extra: object = {}) => ({ ...toEntry({ file_id: path, name: path.split('/').pop(), mime: 'application/pdf', size: '5', modified: null, md5: null, path, type: 'other', date: '' }), ...extra })
    const r = dryRunCounts([e('M/Test Parent/a.pdf'), e('M/Test Parent/desktop.ini', { skipped: 'ini' }), e('Visa/b.pdf'), e('M/Test Relative/c.pdf'), e('M/Nobody/d.pdf')], MAP)
    expect(r.files).toBe(5)
    expect(r.by_lane).toEqual({ health: 4, document_only: 1 })
    expect(r.skipped).toEqual({ ini: 1 })
    expect(r.by_person_lane).toEqual({ p1: { health: 2 }, p2: { health: 1 } })
    expect(r.unassigned).toBe(2)
    expect(JSON.stringify(r)).not.toContain('Test')
  })
})
