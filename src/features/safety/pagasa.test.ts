import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), fail: false, err: null as null | { message: string; code?: string }, rows: [] as unknown[] }))
vi.mock('../../db', () => ({ db: { kv: { get: async (k: string) => (h.kv.has(k) ? { key: k, value: h.kv.get(k) } : undefined), put: async (r: { key: string; value: unknown }) => { h.kv.set(r.key, r.value) } } } }))
vi.mock('../auth/client', () => ({
  supabase: { from: () => { const q: Record<string, unknown> = { select: () => q, gte: () => q, order: () => q, limit: async () => (h.fail ? { data: null, error: { message: 'x' } } : h.err ? { data: null, error: h.err } : { data: h.rows, error: null }) }; return q } }
}))
import { loadPagasa, resetPagasa, shownRows, signalLines, tone, cut, placeNames, PAGASA_HOME, type PagasaRow } from './pagasa'
import type { Unit } from './unitAt'

const NOW = Date.parse('2026-11-09T06:00:00Z')
const row = (o: Partial<PagasaRow> = {}): PagasaRow => ({ dedupe_key: 'k', kind: 'tropical_cyclone', title: 'Typhoon "Samuel" - Tropical Cyclone Bulletin #1', issued_at: '2026-11-09T04:00:00Z', areas: '', signals: [], source_url: `${PAGASA_HOME}tropical-cyclone/severe-weather-bulletin`, fetched_at: new Date(NOW - 60_000).toISOString(), ...o })
beforeEach(() => { h.kv.clear(); h.fail = false; h.err = null; h.rows = [row()]; resetPagasa() })

describe('shownRows', () => {
  it('2 h boundary: exactly 2 h is current, one second more is not', () => {
    const at = (s: number) => shownRows({ rows: [row({ fetched_at: new Date(NOW - s * 1000).toISOString() })], saved: false, readAt: NOW }, NOW).length
    expect(at(7200)).toBe(1)
    expect(at(7201)).toBe(0)
  })
  it('cyclones first, then newest bulletin, at most 3', () => {
    const rows = [row({ dedupe_key: 'a', kind: 'advisory', title: 'A', issued_at: '2026-11-09T05:00:00Z' }), row({ dedupe_key: 'b', title: 'B', issued_at: '2026-11-09T01:00:00Z' }), row({ dedupe_key: 'c', kind: 'rainfall', title: 'C', issued_at: '2026-11-09T05:30:00Z' }), row({ dedupe_key: 'd', title: 'D', issued_at: '2026-11-09T03:00:00Z' })]
    expect(shownRows({ rows, saved: false, readAt: NOW }, NOW).map((r) => r.title)).toEqual(['D', 'B', 'C'])
  })
  it('a saved copy shows as saved up to 24 h and is nothing after', () => {
    const old = row({ fetched_at: new Date(NOW - 20 * 3_600_000).toISOString() })
    expect(shownRows({ rows: [old], saved: true, readAt: NOW - 23 * 3_600_000 }, NOW)).toHaveLength(1)
    expect(shownRows({ rows: [old], saved: true, readAt: NOW - 25 * 3_600_000 }, NOW)).toHaveLength(0)
    expect(shownRows(null, NOW)).toEqual([])
  })
})

describe('signalLines', () => {
  it('empty signals says no wind signal in this bulletin', () => expect(signalLines(row())).toEqual(['No wind signal in this bulletin.']))
  it('names the highest level and a whole-word province match at its own highest level', () => {
    const r = row({ signals: [{ level: 1, areas: 'Cebu, Bohol, Leyte' }, { level: 3, areas: 'Samar and Biliran' }, { level: 2, areas: 'Northern Bohol' }] })
    expect(signalLines(r, ['Bohol'])).toEqual(['Signal #3 raised. Check if your place is listed.', 'Signal #2 lists Bohol.'])
  })
  it('case-insensitive; a name inside another word does not match; no match adds nothing', () => {
    expect(signalLines(row({ signals: [{ level: 1, areas: 'south cotabato' }] }), ['South Cotabato'])[1]).toBe('Signal #1 lists South Cotabato.')
    const miss = signalLines(row({ signals: [{ level: 2, areas: 'Boholano Islands' }] }), ['Bohol'])
    expect(miss).toEqual(['Signal #2 raised. Check if your place is listed.'])
    expect(miss.join(' ')).not.toMatch(/safe|all clear|no signal for/i)
  })
  it('advisory rows have no signal line; text is cut with an ellipsis', () => {
    expect(signalLines(row({ kind: 'advisory' }))).toEqual([])
    expect(cut('x'.repeat(200))).toBe(`${'x'.repeat(160)}…`)
    expect(cut('short')).toBe('short')
  })
  it('tone: none, amber from 1, red from 3', () => {
    expect(tone([row()])).toBeUndefined()
    expect(tone([row({ signals: [{ level: 2, areas: 'a' }] })])).toBe('amber')
    expect(tone([row({ signals: [{ level: 3, areas: 'a' }] })])).toBe('red')
  })
})

describe('pagasa_warnings read', () => {
  it('drops rows whose source_url is not on www.pagasa.dost.gov.ph, saves the rest', async () => {
    h.rows = [row(), row({ dedupe_key: 'x', source_url: 'https://evil.example/https://www.pagasa.dost.gov.ph/' }), row({ dedupe_key: 'y', source_url: 'http://www.pagasa.dost.gov.ph/' })]
    const d = await loadPagasa(NOW)
    expect(d).toMatchObject({ saved: false, readAt: NOW })
    expect(d!.rows).toHaveLength(1)
    expect(h.kv.has('safety.pagasa')).toBe(true)
  })
  it('a missing table reads as null; a failed read uses the saved copy; nothing saved is null', async () => {
    h.err = { message: 'relation "public.pagasa_warnings" does not exist', code: '42P01' }
    expect(await loadPagasa(NOW)).toBeNull()
    h.err = null; resetPagasa(); await loadPagasa(NOW)
    h.fail = true; resetPagasa()
    expect(await loadPagasa(NOW + 60_000)).toMatchObject({ saved: true, readAt: NOW })
    h.kv.clear(); resetPagasa()
    expect(await loadPagasa(NOW + 120_000)).toBeNull()
  })
})

const box = (code: string, name: string, b: [number, number, number, number], parent?: string): Unit => ({ code, name, bbox: b, polys: [[[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]]], parent })
const UNITS = [box('P7', 'Cebu', [123, 9, 125, 12]), box('P12', 'South Cotabato', [124, 5, 126, 7]), box('C12', 'General Santos City', [125, 6, 125.4, 6.3], 'P12')]
describe('audit fixes', () => {
  it('a phone fix gets the province there, not the nearest home zone', () => {
    expect(placeNames({ source: 'gps', zone: 'dampas', weather: { lat: 10.3, lon: 123.9 } }, UNITS)).toEqual(['Cebu'])
    expect(placeNames({ source: 'last', zone: 'dampas', weather: { lat: 6.1, lon: 125.2 } }, UNITS)).toEqual(['South Cotabato', 'General Santos City'])
  })
  it('zone uses the zone map; abroad, no units and no place give no names', () => {
    expect(placeNames({ source: 'zone', zone: 'dampas' }, null)).toEqual(['Bohol'])
    expect(placeNames({ source: 'gps-abroad', zone: 'dampas', weather: { lat: 1, lon: 1 } }, UNITS)).toEqual([])
    expect(placeNames({ source: 'gps', zone: 'dampas', weather: { lat: 10.3, lon: 123.9 } }, null)).toEqual([])
    expect(placeNames(null, UNITS)).toEqual([])
  })
  it('a row already stale when read is not saved and never shows from the saved copy', async () => {
    h.rows = [row(), row({ dedupe_key: 'old', title: 'Old', fetched_at: new Date(NOW - 3 * 3_600_000).toISOString() })]
    await loadPagasa(NOW)
    expect((h.kv.get('safety.pagasa') as { rows: PagasaRow[] }).rows.map((r) => r.dedupe_key)).toEqual(['k'])
    const stale = row({ dedupe_key: 'old2', fetched_at: new Date(NOW - 3 * 3_600_000).toISOString() })
    expect(shownRows({ rows: [stale], saved: true, readAt: NOW }, NOW + 3_600_000)).toEqual([])
  })
  it('only the newest bulletin of a cyclone counts, so an older higher signal cannot set the tone', () => {
    const older = row({ dedupe_key: 'b1', title: 'Typhoon "Samuel" - Tropical Cyclone Bulletin #1', issued_at: '2026-11-09T01:00:00Z', signals: [{ level: 4, areas: 'a' }] })
    const newer = row({ dedupe_key: 'b2', title: 'Typhoon "Samuel" - Tropical Cyclone Bulletin #2', issued_at: '2026-11-09T04:00:00Z', signals: [] })
    const other = row({ dedupe_key: 'o', title: 'Tropical Depression "Tino" - Tropical Cyclone Bulletin #1', issued_at: '2026-11-09T02:00:00Z' })
    const shown = shownRows({ rows: [older, newer, other], saved: false, readAt: NOW }, NOW)
    expect(shown.map((r) => r.dedupe_key)).toEqual(['b2', 'o'])
    expect(tone(shown)).toBeUndefined()
  })
})
