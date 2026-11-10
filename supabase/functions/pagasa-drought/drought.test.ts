// @vitest-environment node
// Fixtures bohol.json and south-cotabato.json are real answers saved 10 Nov 2026 from the public Droughtcaster endpoint (no personal data). Expected values are hand-read from them.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import provinceClimate from '../../../src/data/provinceClimate.json'
import { BUDGET_MS, DROUGHT_URL, type DroughtRow, parseDrought, runDrought } from './drought.ts'
import { PROVINCES } from './provinces.ts'

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')) as unknown

describe('parseDrought', () => {
  it('reads the real Bohol answer: Manila issue day, one assessment, six outlook months, levels mapped', () => {
    expect(parseDrought(fx('bohol.json'), 'Bohol')).toEqual({
      province: 'Bohol',
      issued_at: '2026-11-03',
      months: [
        { month: '2026-10', level: 'not_affected', kind: 'assessment' },
        { month: '2026-11', level: 'not_affected', kind: 'outlook' },
        { month: '2026-12', level: 'dry_condition', kind: 'outlook' },
        { month: '2027-01', level: 'dry_spell', kind: 'outlook' },
        { month: '2027-02', level: 'drought', kind: 'outlook' },
        { month: '2027-03', level: 'drought', kind: 'outlook' },
        { month: '2027-04', level: 'drought', kind: 'outlook' }
      ]
    })
  })
  it('reads the real South Cotabato answer (a two-word province)', () => {
    const r = parseDrought(fx('south-cotabato.json'), 'South Cotabato')!
    expect(r.months.map((m) => m.level)).toEqual(['not_affected', 'not_affected', 'dry_condition', 'dry_spell', 'dry_spell', 'drought', 'drought'])
    expect(r.issued_at).toBe('2026-11-03')
  })
  it('Metro Manila is answered under the name of the region (real answer, 10 Nov 2026): stored under the name the app asks for', () => {
    const r = parseDrought(fx('metro-manila.json'), 'Metro Manila')!
    expect(r.province).toBe('Metro Manila')
    expect(r.issued_at).toBe('2026-11-03')
    expect(r.months[1]).toEqual({ month: '2026-11', level: 'dry_condition', kind: 'outlook' })
    expect(parseDrought(fx('metro-manila.json'), 'Bohol')).toBeNull()
  })
  it('stores nothing for the wrong province, an empty answer, or junk', () => {
    expect(parseDrought(fx('bohol.json'), 'Cebu')).toBeNull()
    expect(parseDrought([], 'Bohol')).toBeNull()
    expect(parseDrought({ error: 'x' }, 'Bohol')).toBeNull()
    expect(parseDrought(null, 'Bohol')).toBeNull()
  })
  it('drops a status or month it does not know instead of guessing, and needs one outlook month', () => {
    const item = (data: unknown[], issuedAt = '2026-11-03T00:00:00+08:00') => [{ name: 'Bohol', issuedAt, data }]
    const r = parseDrought(item([
      { date: '2026-11', type: 'outlook', status: 'Severe drought' }, // unknown status
      { date: '2026-13', type: 'outlook', status: 'Drought' }, // not a month
      { date: '2026-12', type: 'forecast', status: 'Drought' }, // unknown kind
      { date: '2027-01', type: 'outlook', status: ' dry SPELL ' }
    ]), 'bohol')!
    expect(r.months).toEqual([{ month: '2027-01', level: 'dry_spell', kind: 'outlook' }])
    expect(parseDrought(item([{ date: '2026-10', type: 'assessment', status: 'Drought' }]), 'Bohol')).toBeNull() // assessment alone is no outlook
    expect(parseDrought(item([{ date: '2026-11', type: 'outlook', status: 'Drought' }], '2026-02-30T00:00:00+08:00'), 'Bohol')).toBeNull() // a day that does not exist
    expect(parseDrought(item([{ date: '2026-11', type: 'outlook', status: 'Drought' }], 'yesterday'), 'Bohol')).toBeNull()
  })
  it('keeps one entry per month (the later one wins) in month order, at most 12', () => {
    const data = Array.from({ length: 14 }, (_, i) => ({ date: `${2026 + Math.floor((i + 1) / 12)}-${String(((i + 1) % 12) + 1).padStart(2, '0')}`, type: 'outlook', status: 'Drought' }))
    data.push({ date: '2026-02', type: 'outlook', status: 'Dry condition' })
    const r = parseDrought([{ name: 'Bohol', issuedAt: '2026-11-03T00:00:00+08:00', data }], 'Bohol')!
    expect(r.months.length).toBeLessThanOrEqual(12)
    expect([...r.months].map((m) => m.month)).toEqual([...r.months].map((m) => m.month).sort())
    expect(new Set(r.months.map((m) => m.month)).size).toBe(r.months.length)
  })
})

describe('provinces', () => {
  it('are the 83 names of src/data/provinceClimate.json, in the same order', () => {
    expect(PROVINCES).toHaveLength(83)
    expect([...PROVINCES]).toEqual(Object.keys(provinceClimate.provinces))
  })
})

const NOW = Date.parse('2026-11-10T00:00:00Z')
const bohol = fx('bohol.json')
function harness(stored: Record<string, string> = {}) {
  const written: (DroughtRow & { fetched_at: string })[] = []
  const port = { stored: async () => stored, upsert: async (r: DroughtRow & { fetched_at: string }) => { written.push(r) } }
  return { port, written }
}

describe('runDrought', () => {
  it('asks once per province, URL-encoded, a second apart, and stores each row with the run time', async () => {
    const h = harness()
    const urls: string[] = []
    const sleep = vi.fn(async () => undefined)
    const r = await runDrought(h.port, async (u) => { urls.push(u); return bohol }, ['Bohol', 'South Cotabato'], NOW, { sleep })
    expect(urls[1]).toBe(`${DROUGHT_URL}South%20Cotabato`)
    expect(sleep).toHaveBeenCalledTimes(1) // none before the first request
    expect(sleep).toHaveBeenCalledWith(1000)
    expect(r).toEqual({ ok: true, rows: 1, failed: 1, skipped: 0 }) // half stored still counts as a good run; the Bohol answer is not South Cotabato's: stored nothing for it
    expect(h.written.map((w) => [w.province, w.fetched_at])).toEqual([['Bohol', '2026-11-10T00:00:00.000Z']])
  })
  it('refreshes the oldest stored provinces first, never-stored ones before all', async () => {
    const h = harness({ Abra: '2026-11-09T00:00:00Z', Bohol: '2026-11-01T00:00:00Z' })
    const asked: string[] = []
    await runDrought(h.port, async (u) => { asked.push(decodeURIComponent(u.slice(DROUGHT_URL.length))); return [] }, ['Abra', 'Bohol', 'Cebu'], NOW, { sleep: async () => undefined })
    expect(asked).toEqual(['Cebu', 'Bohol', 'Abra'])
  })
  it('stops before the time budget and reports what it skipped', async () => {
    const h = harness()
    let t = 0
    const r = await runDrought(h.port, async () => { t += 60_000; return bohol }, ['Bohol', 'Bohol', 'Bohol', 'Bohol'], NOW, { sleep: async () => undefined, clock: () => t })
    expect(r.rows + r.failed).toBe(2) // 60 s, 120 s > 100 s budget
    expect(r.skipped).toBe(2)
    expect(BUDGET_MS).toBe(100_000)
  })
  it('a failing fetch or write counts as failed and does not stop the others', async () => {
    const h = harness()
    let n = 0
    const r = await runDrought(h.port, async () => { if (n++ === 0) throw new Error('HTTP500'); return bohol }, ['Cebu', 'Bohol'], NOW, { sleep: async () => undefined })
    expect(r).toEqual({ ok: true, rows: 1, failed: 1, skipped: 0 })
    const bad = { stored: async () => { throw new Error('read') }, upsert: async () => { throw new Error('write') } }
    expect(await runDrought(bad, async () => bohol, ['Bohol'], NOW, { sleep: async () => undefined })).toEqual({ ok: false, rows: 0, failed: 1, skipped: 0 })
  })
})

describe('wiring (index.ts is not run here: Deno.serve)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the cron secret in constant time before any work, reuses PAGASA_CRON_SECRET and the shared json helper, and reports counts only', () => {
    expect(src).toContain("Deno.env.get('PAGASA_CRON_SECRET')")
    expect(src).toContain("req.headers.get('x-pagasa-secret')")
    expect(src.indexOf("'unauthorized'")).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain("from '../_shared/http.ts'")
    expect(src).toContain("heartbeat(sb, 'pagasa-drought'")
    expect(src).not.toMatch(/\.catch\(|\.finally\(/) // ML-30: supabase builders are thenable only
  })
})

describe('migration 0063', () => {
  const sql = readFileSync(new URL('../../migrations/0063_pagasa_drought.sql', import.meta.url), 'utf8')
  it('has the contract columns, RLS on, select for signed-in users only and writes for the service role', () => {
    expect(sql).toMatch(/province text primary key/)
    expect(sql).toMatch(/issued_at date not null/)
    expect(sql).toMatch(/months jsonb not null/)
    expect(sql).toMatch(/fetched_at timestamptz not null default now\(\)/)
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('revoke all on public.pagasa_drought from anon, authenticated')
    expect(sql).toContain('grant select on public.pagasa_drought to authenticated')
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/)
    for (const l of ['not_affected', 'dry_condition', 'dry_spell', 'drought']) expect(sql).toContain(l)
  })
  it('has an undo that drops what it made', () => {
    const down = readFileSync(new URL('../../migrations/0063_pagasa_drought.down.sql', import.meta.url), 'utf8')
    expect(down).toContain('drop table if exists public.pagasa_drought')
  })
})
