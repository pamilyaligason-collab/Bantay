// @vitest-environment node
// Phase 2 lane A: the five tier-1 (urgent) cases of D-107 (src/features/world/prefs.ts URGENT_TEXT). Everything else is tier 2 and writes no notification.
// Fixtures are the saved real payloads of alerts-ingest.test.ts; expected values are hand-written.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Port, runIngest, SOURCES, tier1 } from './ingest.ts'
import type { AlertRow } from './parse.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const NOW = 1792240000000 // 2026-10-17 12:26 UTC

const row = (o: Partial<AlertRow>): AlertRow => ({
  id: 'r1', kind: 'quake', level: null, title: 't', what: 'w', where_text: 'x', when_text: 'x', do_now: 'x', source: 'S', source_url: null, issued_at: '2026-10-17T12:00:00.000Z',
  lat: 14.6, lon: 121, bulletin: 'b', checklist: null, timeline: null, expires_at: '2026-10-18T12:00:00.000Z', ...o
})
const t1 = (o: Partial<AlertRow>) => tier1([row(o)], NOW)

describe('tier1: the five urgent cases', () => {
  it('1. wind signal: every signal notifies, as before (the owner kept signals 1 and 2 at tier 1)', () => {
    for (const n of [1, 2, 3, 5]) expect(t1({ id: 'p', kind: 'tcws', level: `Signal No. ${n}` })).toEqual([{ ref: `p:s${n}`, template: 'storm_warning' }])
    expect(t1({ kind: 'tcws', level: null })).toEqual([]) // a lifted signal
  })
  it('2. tsunami: Orange, Red and no level push; Green does not; a Red to Green downgrade writes nothing new', () => {
    expect(t1({ id: 'ts', kind: 'tsunami', level: 'Green' })).toEqual([]) // Green stays in the app
    expect(t1({ id: 'ts', kind: 'tsunami', level: 'Orange' })).toEqual([{ ref: 'ts:orange', template: 'tsunami_warning' }])
    expect(t1({ id: 'ts', kind: 'tsunami', level: 'Red' })).toEqual([{ ref: 'ts:red', template: 'tsunami_warning' }])
    expect(t1({ id: 'ts', kind: 'tsunami', level: null })).toEqual([{ ref: 'ts:any', template: 'tsunami_warning' }])
  })
  it('3. quake: M6.0 and up inside the Philippine box; M5.9, outside the box, or no position or magnitude do not', () => {
    expect(t1({ id: 'q', level: 'Magnitude 6.0' })).toEqual([{ ref: 'q:m6', template: 'quake_strong' }])
    expect(t1({ id: 'q', level: 'Magnitude 7.4' })).toEqual([{ ref: 'q:m7', template: 'quake_strong' }]) // a raise to M7 notifies again
    expect(t1({ level: 'Magnitude 5.9' })).toEqual([])
    expect(t1({ level: 'Magnitude 6.5', lat: 35.7, lon: 139.7 })).toEqual([]) // Tokyo
    expect(t1({ level: 'Magnitude 6.5', lat: 3.9, lon: 121 })).toEqual([]) // just south of the box
    expect(t1({ level: 'Magnitude 6.5', lat: 14, lon: 127.1 })).toEqual([]) // just east of it
    expect(t1({ level: 'Magnitude 6.5', lat: null, lon: null })).toEqual([])
    expect(t1({ level: null })).toEqual([])
    expect(t1({ level: 'Magnitude unknown' })).toEqual([])
  })
  it('4. rainfall: Red (and the CAP words Severe, Extreme) notify; Minor, Moderate and an ended advisory do not', () => {
    for (const lv of ['Red', 'Severe', 'Extreme']) expect(t1({ id: 'rain', kind: 'rainfall', level: lv })).toEqual([{ ref: `rain:${lv.toLowerCase()}:2026-10-17`, template: 'flood_red' }])
    for (const lv of ['Minor', 'Moderate', 'Orange', 'Yellow', null]) expect(t1({ kind: 'rainfall', level: lv }), String(lv)).toEqual([])
  })
  it('4b. a second Severe advisory for the same zone on a later Manila day is a new notice (the row id is fixed per zone)', () => {
    const a = t1({ id: 'pagasa-rain-conel', kind: 'rainfall', level: 'Severe', issued_at: '2026-10-17T12:00:00.000Z' })
    const b = t1({ id: 'pagasa-rain-conel', kind: 'rainfall', level: 'Severe', issued_at: '2026-10-18T12:00:00.000Z' })
    expect(a[0].ref).not.toBe(b[0].ref)
    expect(a[0].ref).toBe('pagasa-rain-conel:severe:2026-10-17')
    expect(t1({ id: 'pagasa-rain-conel', kind: 'rainfall', level: 'Severe', issued_at: '2026-10-17T17:00:00.000Z' })[0].ref).toBe('pagasa-rain-conel:severe:2026-10-18') // 01:00 Manila is the next day
  })
  it('a Red to Green downgrade pushes nothing: the Green row has no notice, and the Red ref was written earlier', () => {
    expect(t1({ id: 'ts', kind: 'tsunami', level: 'Red' })[0].ref).toBe('ts:red')
    expect(t1({ id: 'ts', kind: 'tsunami', level: 'Green' })).toEqual([])
  })
  it('the four new cases push only a row issued within 2 hours; wind signals keep no age limit', () => {
    const at = (min: number) => new Date(NOW - min * 60_000).toISOString()
    for (const o of [{ kind: 'tsunami', level: 'Red' }, { kind: 'quake', level: 'Magnitude 7.0' }, { kind: 'rainfall', level: 'Red' }, { kind: 'volcano', level: 'Alert Level 4' }] as const) {
      expect(t1({ ...o, issued_at: at(120) }), `${o.kind} at 120 min`).toHaveLength(1)
      expect(t1({ ...o, issued_at: at(121) }), `${o.kind} at 121 min`).toEqual([])
      expect(t1({ ...o, issued_at: 'junk' }), `${o.kind} junk`).toEqual([])
    }
    expect(t1({ kind: 'tcws', level: 'Signal No. 2', issued_at: at(60 * 20) })).toHaveLength(1)
  })
  it('an unreadable expiry is not live', () => expect(t1({ kind: 'tsunami', level: 'Red', expires_at: 'junk' })).toEqual([]))
  it('5. volcano: alert level 3 and up; levels 0 to 2 and a GDACS colour do not', () => {
    expect(t1({ id: 'v', kind: 'volcano', level: 'Alert Level 3' })).toEqual([{ ref: 'v:l3', template: 'volcano_raised' }])
    expect(t1({ id: 'v', kind: 'volcano', level: 'Alert Level 5' })).toEqual([{ ref: 'v:l5', template: 'volcano_raised' }])
    for (const lv of ['Alert Level 0', 'Alert Level 2', 'Orange', 'Red', null]) expect(t1({ kind: 'volcano', level: lv }), String(lv)).toEqual([])
  })
  it('an expired row never notifies, whatever its level', () => {
    for (const o of [{ kind: 'tsunami', level: 'Red' }, { kind: 'quake', level: 'Magnitude 7.0' }, { kind: 'rainfall', level: 'Red' }, { kind: 'volcano', level: 'Alert Level 4' }, { kind: 'tcws', level: 'Signal No. 3' }] as const)
      for (const expires_at of [new Date(NOW).toISOString(), new Date(NOW - 1).toISOString(), null]) expect(t1({ ...o, expires_at }), `${o.kind} ${expires_at}`).toEqual([])
  })
  it('every other kind is tier 2: gdacs, air, heat, thunderstorm, utility, local, eonet', () => {
    for (const kind of ['gdacs', 'air', 'heat', 'thunderstorm', 'utility', 'local', 'eonet'] as const) expect(t1({ kind, level: 'Red' }), kind).toEqual([])
  })
})

// the whole run, with the saved payloads: the USGS file's M6.8 near Manila (id us7000big1) is the one urgent row of the day
function notifyPort(people: string[]) {
  const seen = new Set<string>()
  const log = { flushes: 0, rows: [] as string[] }
  const port: Port = {
    existing: async () => new Map(), upsert: async () => undefined, setStale: async () => undefined, members: async () => people,
    notify: async (p, t, ref) => { const k = `${p}|${ref}`; if (seen.has(k)) return 0; seen.add(k); log.rows.push(`${p}|${t}|${ref}`); return 1 },
    flush: async () => void (log.flushes += 1)
  }
  return { port, log }
}
const bodies: Record<string, string> = { USGS: fx('usgs.json'), GDACS: fx('gdacs.xml'), PAGASA: fx('pagasa-feed.xml'), EONET: fx('eonet.json'), 'Open-Meteo': fx('air.json') }
const fetchWith = (over: Record<string, string> = {}, fail: string[] = []) => async (url: string) => {
  const s = SOURCES.find((x) => x.urls.includes(url))!.source
  if (fail.includes(s)) throw new Error('HTTP503')
  return over[s] ?? bodies[s]
}

describe('runIngest notifications', () => {
  it('a full run notifies every member once for the M6.8, nothing for the other rows, and a rerun writes 0', async () => {
    const { port, log } = notifyPort(['a', 'b'])
    await runIngest(port, fetchWith(), NOW)
    expect(log.rows).toEqual(['a|quake_strong|usgs-us7000big1:m6', 'b|quake_strong|usgs-us7000big1:m6'])
    expect(log.flushes).toBe(1)
    await runIngest(port, fetchWith(), NOW)
    expect(log.rows).toHaveLength(2)
    expect(log.flushes).toBe(1) // nothing new, no flush
  })
  it('a failed USGS fetch writes no notification (the old rows are kept, not re-announced)', async () => {
    const { port, log } = notifyPort(['a'])
    await runIngest(port, fetchWith({}, ['USGS']), NOW)
    expect(log.rows).toEqual([])
  })
  it('a tsunami row from GDACS notifies, which it did not before', async () => {
    const { port, log } = notifyPort(['a'])
    const ts = bodies.GDACS.replace(/gdacs:eventtype>[A-Z]{2}</, 'gdacs:eventtype>TS<').replace('Thu, 15 Oct 2026 00:00:00 GMT', 'Sat, 17 Oct 2026 11:00:00 GMT') // the first item becomes a tsunami, modified 06:00, 12 h life
    await runIngest(port, fetchWith({ GDACS: ts }, ['USGS']), NOW)
    expect(log.rows).toEqual(['a|tsunami_warning|gdacs-TS-1001400:orange'])
  })
  it('EONET is the last source, after Open-Meteo, so it cannot delay the official feeds', () => {
    expect(SOURCES.map((s) => s.source)).toEqual(['USGS', 'GDACS', 'PAGASA', 'Open-Meteo', 'EONET'])
  })
  it('past 130 s of run time (a flush waits up to 15 s, the platform stops at 150 s) the rows are still written but no flush starts (dose-watch offers them within 15 min)', async () => {
    const { port, log } = notifyPort(['a'])
    let t = 0
    const clock = () => (t += 131_000) // the first read is the start; every later read is already over budget
    await runIngest(port, fetchWith(), NOW, clock)
    expect(log.rows).toEqual(['a|quake_strong|usgs-us7000big1:m6'])
    expect(log.flushes).toBe(0)
    const again = notifyPort(['a'])
    await runIngest(again.port, fetchWith(), NOW, () => 0)
    expect(again.log.flushes).toBe(1) // inside the budget it flushes as before
  })
  it('EONET is run and stored but never notifies', async () => {
    const { port, log } = notifyPort(['a'])
    const stored: string[] = []
    port.upsert = async (rows) => void stored.push(...rows.map((r) => r.id))
    const eonet = bodies.EONET.replace(/2026-11-0\dT/g, '2026-10-17T') // dates moved to the day of NOW
    await runIngest(port, fetchWith({ EONET: eonet }, ['USGS', 'GDACS']), NOW)
    expect(stored).toContain('eonet-EONET_25728')
    expect(log.rows).toEqual([])
  })
  it('a failing EONET source marks only EONET stale and does not stop the others', async () => {
    const { port } = notifyPort(['a'])
    const stale: [string, boolean][] = []
    port.setStale = async (s, v) => void stale.push([s, v])
    const res = await runIngest(port, fetchWith({}, ['EONET']), NOW)
    expect(res.EONET).toEqual({ ok: false, rows: 0 })
    expect(res.USGS.ok).toBe(true)
    expect(stale).toContainEqual(['EONET', true])
    expect(stale.filter(([, v]) => v).map(([s]) => s)).toEqual(['EONET'])
  })
})
