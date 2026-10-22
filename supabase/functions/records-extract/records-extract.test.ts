// @vitest-environment node
// records-extract must read a phone scan the way the laptop import reads a paper. The first block pins this port against the
// scripts it was taken from (lib.mjs, extract.mjs, normalize.mjs, load.mjs). All names and values are made up.
import { describe, expect, it, vi } from 'vitest'
import { normalizeDraft as pcNormalizeDraft } from '../../../scripts/import/extract.mjs'
import { buildRequest as pcBuildRequest, MAX_TOKENS as PC_MAX_TOKENS, PROMPT as PC_PROMPT, usageCounts as pcUsageCounts } from '../../../scripts/import/lib.mjs'
import { buildLoadSql, uuid5 as pcUuid5 } from '../../../scripts/import/load.mjs'
import { loadCatalog, normalizeTest as pcNormalizeTest } from '../../../scripts/import/normalize.mjs'
import {
  buildRequest, type CatalogRow, DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, errorCode, extractDocument, HttpError, mapDraft, MAX_PAGES, normalizeDraft,
  normalizeTest, orderPages, type PageRow, parseBody, type Port, PROMPT, runOne, runSweep, type Row, sendToOpenRouter, summary, usageCounts, MAX_TOKENS, TABLES, toBase64, uuid5, withRetry
} from './logic.ts'

const catalog = loadCatalog() as CatalogRow[]
const env = { model: 'test/paid-model', fallbackModel: 'test/paid-fallback' }
const DOC = '20000000-0000-4000-8000-000000000001'
const PERSON = '10000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-00000000000b'

// A made-up lab + prescription paper, in the messy shape a model returns.
const RAW = {
  doc_kind: 'lab', doc_date: '2026-09-30', collected_at: '2026-09-30 07:15', released_at: null, facility: 'Test Clinic', patient_name_as_printed: 'TEST PERSON',
  tests: [
    { panel: 'Lipid', name: 'Cholesterol', value: '5.2', unit: 'mmol/L', flag: 'H', ref_low: null, ref_high: '5.0', ref_text: null },
    { panel: 'Lipid', name: 'HDL', value: '1.1', unit: 'mmol/L', flag: '', ref_low: '1.0', ref_high: null },
    { panel: null, name: 'FBS', value: '1,234', unit: 'mg/dl', flag: 'n' },
    { name: 'Urine colour', value: 'yellow' },
    { name: 'Blank', value: null },
    'not an object'
  ],
  rx: { date: '2026-09-30', prescriber: 'Dr Test', follow_up: '2026-10-30', lines: [{ line_no: 1, drug: 'Testamol 500 mg', frequency: '2x a day' }, { line_no: 1, drug: 'Fakeprazole', unclear: true, bbox: { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }] },
  imaging: null,
  vaccinations: [{ vaccine: 'Test vaccine', dose_no: 2, given_on: '2026-01-02' }, { vaccine: '' }],
  allergies: ['Testcillin', 'testcillin.', ''],
  conditions: ['Test condition'],
  confidence: 0.95,
  extra_field: 'dropped'
}

describe('the port matches the laptop scripts', () => {
  it('uses the same prompt and default models', () => {
    expect(PROMPT).toBe(PC_PROMPT)
    expect([DEFAULT_MODEL, DEFAULT_FALLBACK_MODEL]).toEqual(['google/gemini-3.5-flash-lite', 'anthropic/claude-haiku-5.5'])
  })
  it('builds the same request for one image or one PDF', () => {
    for (const mime of ['image/jpeg', 'application/pdf']) {
      expect(buildRequest({ ...env, pages: [{ mime, base64: 'QUJD' }] })).toEqual(pcBuildRequest({ ...env, mime, base64: 'QUJD' }))
    }
  })
  it('normalises a draft the same way', () => {
    expect(normalizeDraft(RAW)).toEqual(pcNormalizeDraft(RAW))
    expect(normalizeDraft(null)).toEqual(pcNormalizeDraft(null))
    expect(normalizeDraft({ doc_kind: 'weird', confidence: '2', rx: [] })).toEqual(pcNormalizeDraft({ doc_kind: 'weird', confidence: '2', rx: [] }))
  })
  it('normalises lab values the same way', () => {
    const samples = [...RAW.tests.filter((t) => typeof t === 'object'), { name: 'Creatinine', value: '88', unit: 'µmol/L' }, { name: 'WBC', value: '7.1', unit: 'x10^3/uL' }, { name: 'Neutrophils', value: '0.55' }, { name: 'TSH', value: '<0.01', unit: 'uIU/mL', flag: 'L' }]
    for (const t of samples) expect(normalizeTest(t as Record<string, unknown>, catalog)).toEqual(pcNormalizeTest(t, catalog))
  })
  it('makes the same v5 ids', async () => {
    for (const n of ['sf:abc', 'lab:scan:x:0', 'all:allergies:p:testcillin']) expect(await uuid5(n)).toBe(pcUuid5(n))
  })
  it('writes the same tables and row counts as load.mjs (drafts only)', async () => {
    const pc = buildLoadSql({
      manifest: { files: [{ drive_file_id: 'f1', person_folder: 'Test Person', path: 'Test Person/lab.pdf', name: 'lab.pdf', mime: 'application/pdf' }] },
      drafts: { f1: { ...pcNormalizeDraft(RAW), via: 'vision' } },
      peopleMap: { 'Test Person': PERSON },
      catalog
    })
    const m = await mapDraft({ documentId: DOC, personId: PERSON, createdBy: USER, kind: 'lab', draft: normalizeDraft(RAW), catalog })
    const ours = Object.fromEntries(TABLES.filter((t) => m.rows[t].length).map((t) => [t, m.rows[t].length]))
    const theirs = Object.fromEntries(Object.entries(pc.summary.rows as Record<string, number>).filter(([t]) => t !== 'documents'))
    expect(ours).toEqual(theirs)
    expect(pc.summary.row_status.lab_results).toEqual({ draft: 4 })
  })
})

describe('mapDraft', () => {
  const run = (over: Partial<Parameters<typeof mapDraft>[0]> = {}) => mapDraft({ documentId: DOC, personId: PERSON, createdBy: USER, kind: 'lab', draft: normalizeDraft(RAW), catalog, ...over })
  it('every row is a draft for the chosen person, stamped with the uploader, never auto-confirmed', async () => {
    const m = await run({ draft: normalizeDraft({ ...RAW, confidence: 1 }) })
    const all = TABLES.flatMap((t) => m.rows[t])
    expect(all.length).toBeGreaterThan(5)
    for (const r of all) {
      expect(r.status).toBe('draft')
      expect(r.person_id).toBe(PERSON)
      expect(r.created_by).toBe(USER)
      expect(r).not.toHaveProperty('confirmed_source')
      expect(r).not.toHaveProperty('confirmed_by')
    }
    expect(m.document).not.toHaveProperty('status')
  })
  it('maps lab values with the catalog (codes, canonical units, Manila time) and keeps unknown tests raw', async () => {
    const { rows } = await run()
    const by = (n: string) => rows.lab_results.find((r) => r.name_raw === n)!
    expect(by('Cholesterol')).toMatchObject({ test_code: 'total_cholesterol', value_num: 5.2, value_canonical: 201.084, flag: 'H', ref_high: 5, collected_at: '2026-09-30T07:15+08:00' })
    expect(by('FBS')).toMatchObject({ test_code: 'fasting_glucose', value_num: 1234, value_canonical: 1234, flag: 'N', panel_id: null })
    expect(by('Urine colour')).toMatchObject({ test_code: null, value_num: null, value_text: 'yellow' })
    expect(rows.lab_results.find((r) => r.name_raw === 'Blank')).toBeUndefined()
    expect(rows.lab_panels).toHaveLength(1)
    expect(by('HDL').panel_id).toBe(rows.lab_panels[0].id)
  })
  it('prescription lines get unique line numbers and keep unclear and the crop', async () => {
    const { rows } = await run()
    expect(rows.prescriptions).toHaveLength(1)
    expect(rows.prescription_items.map((r) => [r.line_no, r.unclear])).toEqual([[1, false], [2, true]])
    expect(rows.prescription_items[1].crop).toEqual({ page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1 })
    expect(rows.prescription_items[0].prescription_id).toBe(rows.prescriptions[0].id)
  })
  it('the app kind wins; "other" takes what the model read', async () => {
    expect((await run({ kind: 'prescription' })).document.kind).toBe('prescription')
    expect((await run({ kind: 'other' })).document.kind).toBe('lab')
    expect((await run({ kind: 'other', draft: normalizeDraft({}) })).document.kind).toBe('other')
  })
  it('ids are stable across runs (a retry is a no-op) and allergies share the laptop id', async () => {
    const a = await run()
    const b = await run()
    expect(TABLES.flatMap((t) => b.rows[t].map((r) => r.id))).toEqual(TABLES.flatMap((t) => a.rows[t].map((r) => r.id)))
    expect(a.rows.allergies).toHaveLength(1) // "Testcillin" and "testcillin." are one allergy
    expect(a.rows.allergies[0].id).toBe(pcUuid5(`all:allergies:${PERSON}:testcillin`))
    expect(a.rows.conditions[0]).toMatchObject({ name: 'Test condition', status: 'draft' })
  })
  it('a bad date or timestamp stays null, never guessed', async () => {
    const m = await run({ draft: normalizeDraft({ ...RAW, doc_date: '2026-02-30', collected_at: 'yesterday' }) })
    expect(m.document).toMatchObject({ doc_date: null, collected_at: null })
  })
})

describe('cost guard', () => {
  it('caps output, turns reasoning down, and matches the laptop path', () => {
    const b = buildRequest({ ...env, pages: [{ mime: 'image/jpeg', base64: 'AA' }] })
    expect(b.max_tokens).toBe(MAX_TOKENS)
    expect(MAX_TOKENS).toBe(PC_MAX_TOKENS)
    expect(b.reasoning).toEqual({ enabled: false })
  })
  it('usage counts match the laptop path and carry no text', async () => {
    const j = { model: 'm/x', usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.1 }, choices: [{ message: { content: '{"name":"SECRET"}' } }] }
    expect(usageCounts(j)).toEqual(pcUsageCounts(j))
    const seen: unknown[] = []
    await sendToOpenRouter((async () => ({ ok: true, status: 200, json: async () => j })) as never, {}, 'k', (u) => seen.push(u))
    expect(seen).toEqual([{ model: 'm/x', prompt_tokens: 10, completion_tokens: 5, reasoning_tokens: null, cost: 0.1 }])
    expect(JSON.stringify(seen)).not.toContain('SECRET')
  })
})

describe('buildRequest for scans', () => {
  it('sends every page in order after the prompt, keeps zdr and refuses free models', () => {
    const b = buildRequest({ ...env, pages: [{ mime: 'image/jpeg', base64: 'AA' }, { mime: 'image/jpeg', base64: 'BB' }] })
    const c = b.messages[0].content as { type: string; image_url?: { url: string } }[]
    expect(c.map((x) => x.type)).toEqual(['text', 'image_url', 'image_url'])
    expect(c[2].image_url!.url).toBe('data:image/jpeg;base64,BB')
    expect(b.provider).toEqual({ zdr: true, data_collection: 'deny' })
    expect(() => buildRequest({ ...env, model: 'x/y:free', pages: [{ mime: 'image/jpeg', base64: 'AA' }] })).toThrow()
    expect(() => buildRequest({ ...env, pages: [] })).toThrow()
  })
  it('base64 matches Buffer for large input', () => {
    const b = new Uint8Array(100_000).map((_, i) => (i * 31) % 256)
    expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'))
  })
})

describe('orderPages', () => {
  const p = (page_no: number, over: Partial<PageRow> = {}): PageRow => ({ id: `s${page_no}`, page_no, name: `p${String(page_no).padStart(2, '0')}.jpg`, mime: 'image/jpeg', size_bytes: 1000, storage_path: `x/${page_no}`, ...over })
  it('orders by page_no, then name', () => {
    const r = orderPages([p(3), p(1), p(2)])
    expect('pages' in r && r.pages.map((x) => x.page_no)).toEqual([1, 2, 3])
  })
  it('refuses empty, too many, too large and unknown types with a short code', () => {
    expect(orderPages([])).toEqual({ error: 'no_pages' })
    expect(orderPages(Array.from({ length: MAX_PAGES + 1 }, (_, i) => p(i + 1)))).toEqual({ error: 'too_many_pages' })
    expect(orderPages([p(1, { size_bytes: 11 * 1024 * 1024 })])).toEqual({ error: 'too_large' })
    expect(orderPages([1, 2, 3].map((n) => p(n, { size_bytes: 8 * 1024 * 1024 })))).toEqual({ error: 'too_large' })
    expect(orderPages([p(1, { mime: 'text/plain' })])).toEqual({ error: 'unsupported_mime' })
  })
})

describe('parseBody', () => {
  it('a document id, a sweep, or nothing', () => {
    expect(parseBody(JSON.stringify({ document_id: DOC.toUpperCase() }))).toEqual({ documentId: DOC })
    expect(parseBody('')).toBe('sweep')
    expect(parseBody('{}')).toBe('sweep')
    expect(parseBody('{"document_id":"nope"}')).toBeNull()
    expect(parseBody('{"other":1}')).toBeNull()
    expect(parseBody('[1]')).toBeNull()
    expect(parseBody('not json')).toBeNull()
    expect(parseBody(`{"document_id":"${DOC}","x":"${'a'.repeat(3000)}"}`)).toBeNull()
  })
})

describe('OpenRouter calls', () => {
  it('retries 429 and 5xx, not 4xx', async () => {
    const sleepFn = vi.fn(async () => {})
    let n = 0
    await expect(withRetry(async () => { n++; throw new HttpError(503) }, { sleepFn })).rejects.toThrow()
    expect(n).toBe(3)
    n = 0
    await expect(withRetry(async () => { n++; throw new HttpError(401) }, { sleepFn })).rejects.toThrow()
    expect(n).toBe(1)
  })
  it('a cut-off answer becomes truncated', async () => {
    const f = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"tests":[' } }] }) })
    expect(errorCode(await sendToOpenRouter(f, {}, 'k').catch((x) => x))).toBe('truncated')
  })
  it('never echoes model output: non-JSON content becomes not_json', async () => {
    const f = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Cholesterol 5.2 TEST PERSON' } }] }) })
    const e = await sendToOpenRouter(f, {}, 'k').catch((x) => x)
    expect(errorCode(e)).toBe('not_json')
    expect(String(e.message)).not.toMatch(/Cholesterol|TEST/)
    expect(errorCode(new Error('Cholesterol 5.2'))).toBe('failed')
    expect(errorCode(new HttpError(402))).toBe('openrouter_402')
  })
})

// ---------- the run, with a fake database ----------
function fakePort(over: Partial<Port> = {}) {
  const calls: string[] = []
  const inserted: Record<string, Row[]> = {}
  const state = { finished: null as null | [string, string | null], patch: null as Row | null, body: null as unknown }
  const port: Port = {
    claim: async () => { calls.push('claim'); return 2 },
    due: async () => [DOC],
    document: async () => ({ id: DOC, person_id: PERSON, kind: 'lab', status: 'draft', created_by: USER }),
    pages: async () => [
      { id: 's2', page_no: 2, name: 'p02.jpg', mime: 'image/jpeg', size_bytes: 3, storage_path: `${PERSON}/${DOC}/p02.jpg` },
      { id: 's1', page_no: 1, name: 'p01.jpg', mime: 'image/jpeg', size_bytes: 3, storage_path: `${PERSON}/${DOC}/p01.jpg` }
    ],
    download: async (path) => new TextEncoder().encode(path.endsWith('p01.jpg') ? 'one' : 'two'),
    catalog: async () => catalog,
    insert: async (t, rows) => { calls.push(`insert:${t}`); inserted[t] = rows },
    updateDocument: async (_id, patch) => { calls.push('document'); state.patch = patch },
    finish: async (_id, s, e) => { calls.push(`finish:${s}`); state.finished = [s, e] },
    read: async (body) => { state.body = body; return RAW },
    ...over
  }
  return { port, calls, inserted, state }
}

describe('extractDocument', () => {
  it('reads the pages in order, writes drafts parents first, then marks the pages queued', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const f = fakePort()
    const r = await extractDocument(f.port, DOC, env)
    expect(r).toMatchObject({ status: 'queued', pages: 2, rows: { lab_results: 4, prescription_items: 2 } })
    const parts = ((f.state.body as { messages: { content: { image_url?: { url: string } }[] }[] }).messages[0].content).slice(1).map((c) => c.image_url!.url)
    expect(parts).toEqual([`data:image/jpeg;base64,${btoa('one')}`, `data:image/jpeg;base64,${btoa('two')}`])
    expect(f.calls).toEqual(['document', 'insert:lab_panels', 'insert:lab_results', 'insert:prescriptions', 'insert:prescription_items', 'insert:vaccinations', 'insert:allergies', 'insert:conditions', 'finish:queued'])
    expect(f.state.finished).toEqual(['queued', null])
    expect(JSON.stringify(r)).not.toMatch(/Cholesterol|TEST|Testamol/) // the result (what gets logged) holds counts only
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
  it('a card, a confirmed document or a missing one is not read', async () => {
    for (const doc of [{ kind: 'id_card', status: 'draft' }, { kind: 'lab', status: 'confirmed' }]) {
      const f = fakePort({ document: async () => ({ id: DOC, person_id: PERSON, created_by: USER, ...doc }), read: async () => { throw new Error('must not read') } })
      expect(await extractDocument(f.port, DOC, env)).toMatchObject({ status: 'failed', error: 'not_a_scan' })
    }
    const f = fakePort({ document: async () => null })
    expect((await extractDocument(f.port, DOC, env)).error).toBe('not_a_scan')
  })
  it("a page outside the person's own folder is never downloaded or read", async () => {
    const f = fakePort({
      pages: async () => [{ id: 's1', page_no: 1, name: 'p01.jpg', mime: 'image/jpeg', size_bytes: 3, storage_path: `someone-else/${DOC}/p01.jpg` }],
      download: async () => { throw new Error('must not download') },
      read: async () => { throw new Error('must not read') }
    })
    expect(await extractDocument(f.port, DOC, env)).toMatchObject({ status: 'failed', error: 'bad_path' })
    expect(f.inserted).toEqual({})
  })
  it('failures leave the pages failed with a short code and no drafts', async () => {
    const cases: [Partial<Port>, string][] = [
      [{ download: async () => null }, 'download'],
      [{ read: async () => { throw new HttpError(500) } }, 'openrouter_500'],
      [{ read: async () => { throw new Error('not_json') } }, 'not_json'],
      [{ download: async () => new Uint8Array(11 * 1024 * 1024) }, 'too_large'],
      [{ insert: async () => { throw new Error('write') } }, 'write']
    ]
    for (const [over, code] of cases) {
      const f = fakePort(over)
      expect(await extractDocument(f.port, DOC, env)).toMatchObject({ status: 'failed', error: code })
      expect(f.state.finished).toEqual(['failed', code])
    }
  })
})

describe('runOne and runSweep', () => {
  it('nothing claimed: skipped, nothing read', async () => {
    const f = fakePort({ claim: async () => 0, read: async () => { throw new Error('must not read') } })
    expect(await runOne(f.port, DOC, env)).toEqual({ document_id: DOC, status: 'skipped' })
  })
  it('the sweep claims and reads each due document, and the summary has counts only', async () => {
    const f = fakePort({ due: async () => [DOC, '20000000-0000-4000-8000-000000000002'], claim: async (id) => (id === DOC ? 1 : 0) })
    const rs = await runSweep(f.port, env)
    expect(summary(rs)).toEqual({ documents: 2, queued: 1, failed: 0, skipped: 1, errors: [] })
  })
})
