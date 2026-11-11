// @vitest-environment node
// S30 G4 (owner decision a): a Philippine hazard push reads "Philippines: ..." for a recipient whose people.tz is not Asia/Manila; Philippine recipients get exactly the plain template as before.
// The `<id>_ph` twins live in the shared templates file (another lane); these tests add them for the run and take them out again, and one test proves the old file keeps the plain id.
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { TEMPLATES } from '../_shared/templates.ts'
import { isUndefinedColumn as doseWatchUndefinedColumn } from '../dose-watch/logic.ts'
import { isUndefinedColumn, notifyTier1, phTemplate, type Port } from './ingest.ts'
import type { AlertRow } from './parse.ts'

const NOW = 1792240000000 // 2026-10-17 12:26 UTC
const row = (o: Partial<AlertRow>): AlertRow => ({
  id: 'r1', kind: 'quake', level: 'Magnitude 6.5', title: 't', what: 'w', where_text: 'x', when_text: 'x', do_now: 'x', source: 'S', source_url: null, issued_at: '2026-10-17T12:00:00.000Z',
  lat: 14.6, lon: 121, bulletin: 'b', checklist: null, timeline: null, expires_at: '2026-10-18T12:00:00.000Z', ...o
})
const TWINS = ['storm_warning', 'tsunami_warning', 'quake_strong', 'flood_red', 'volcano_raised']
const reg = TEMPLATES as unknown as Record<string, unknown>
const addTwins = () => { for (const id of TWINS) reg[`${id}_ph`] = { ...(TEMPLATES as Record<string, object>)[id], title: `Philippines: ${(TEMPLATES as Record<string, { title: string }>)[id].title}` } }
afterEach(() => { for (const id of TWINS) delete reg[`${id}_ph`] })

function port(zones: Record<string, string | null> | 'none' | 'throw', people: string[]) {
  const log = { rows: [] as string[], flushes: 0 }
  const p: Port = {
    existing: async () => new Map(), upsert: async () => undefined, setStale: async () => undefined, members: async () => people,
    zones: zones === 'none' ? undefined : async () => { if (zones === 'throw') throw new Error('read'); return new Map(Object.entries(zones)) },
    notify: async (who, t, ref) => { log.rows.push(`${who}|${t}|${ref}`); return 1 },
    flush: async () => void (log.flushes += 1)
  }
  return { p, log }
}

describe('phTemplate', () => {
  it('is the _ph twin when the shared templates have it, the plain id when they do not (no push lost to a missing id)', () => {
    expect(phTemplate('digest')).toBe('digest') // no twin: the plain id, so no push is lost
    addTwins()
    for (const id of TWINS) expect(phTemplate(id)).toBe(`${id}_ph`)
    expect(phTemplate('digest')).toBe('digest') // not a hazard of this function
  })
})

describe('notifyTier1 recipients by zone', () => {
  it('Manila and unknown recipients get the plain template, Texas and any other zone get the Philippines twin', async () => {
    addTwins()
    const { p, log } = port({ ph: 'Asia/Manila', tx: 'America/Chicago', blank: null, odd: 'Not/AZone', jp: 'Asia/Tokyo' }, ['ph', 'tx', 'blank', 'odd', 'jp', 'missing'])
    expect(await notifyTier1(p, [row({ id: 'q', level: 'Magnitude 6.5' })], NOW)).toBe(6)
    expect(log.rows).toEqual([
      'ph|quake_strong|q:m6', 'tx|quake_strong_ph|q:m6', 'blank|quake_strong|q:m6', 'odd|quake_strong|q:m6', 'jp|quake_strong_ph|q:m6', 'missing|quake_strong|q:m6'
    ]) // a bad zone name and a person with no row are Manila (safeZone), exactly as dose-watch reads them; the ref is identical so the database still de-duplicates
    expect(log.flushes).toBe(1)
  })
  it('every one of the five tier-1 cases is labelled for a Texas recipient', async () => {
    addTwins()
    const rows = [
      row({ id: 'w', kind: 'tcws', level: 'Signal No. 3', lat: null, lon: null }),
      row({ id: 't', kind: 'tsunami', level: 'Orange' }),
      row({ id: 'q', kind: 'quake', level: 'Magnitude 6.1' }),
      row({ id: 'f', kind: 'rainfall', level: 'Red' }),
      row({ id: 'v', kind: 'volcano', level: 'Alert Level 3' })
    ]
    const { p, log } = port({ tx: 'America/Chicago' }, ['tx'])
    await notifyTier1(p, rows, NOW)
    expect(log.rows.map((r) => r.split('|')[1]).sort()).toEqual(['flood_red_ph', 'quake_strong_ph', 'storm_warning_ph', 'tsunami_warning_ph', 'volcano_raised_ph'])
  })
  it('before migration 0065 (no zones) or with an older fake, every recipient is plain exactly as before', async () => {
    addTwins()
    const none = port('none', ['a'])
    await notifyTier1(none.p, [row({ id: 'q' })], NOW)
    expect(none.log.rows).toEqual(['a|quake_strong|q:m6'])
    const empty = port({}, ['a'])
    await notifyTier1(empty.p, [row({ id: 'q' })], NOW)
    expect(empty.log.rows).toEqual(['a|quake_strong|q:m6'])
  })
  it('a failed zones read sends nothing this run (like a failed members read); the next run, which finds the live row again, sends it', async () => {
    addTwins()
    const bad = port('throw', ['a'])
    expect(await notifyTier1(bad.p, [row({ id: 'q' })], NOW)).toBe(0)
    expect(bad.log.rows).toEqual([])
    const good = port({ a: 'America/Chicago' }, ['a'])
    expect(await notifyTier1(good.p, [row({ id: 'q' })], NOW)).toBe(1)
  })
})

describe('isUndefinedColumn (copy of the dose-watch rule)', () => {
  const cases: [unknown, boolean][] = [
    [{ code: '42703', message: 'x' }, true],
    [{ code: 'PGRST200', message: 'column people.tz does not exist' }, true],
    [{ message: 'column "tz" does not exist' }, true],
    [{ code: '57014', message: 'canceling statement due to statement timeout' }, false],
    [{ code: '42501', message: 'permission denied for table people' }, false],
    [{ message: 'column other does not exist' }, false],
    [null, false], [undefined, false], ['42703', false]
  ]
  it.each(cases)('%j is %s, the same as dose-watch', (e, want) => {
    expect(isUndefinedColumn(e)).toBe(want)
    expect(doseWatchUndefinedColumn(e)).toBe(want)
  })
})

describe('wiring in index.ts (source guard, ML-30)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('reads people.tz, falls back only on the missing-column error and rethrows the rest', () => {
    expect(src).toContain(".select('id,tz')")
    expect(src).toContain("if (isUndefinedColumn(error)) return new Map(); throw new Error('read')")
    expect(src).toContain('async zones()')
  })
})
