// @vitest-environment node
// Invented alert rows only (titles are made up). Expected values are hand-written.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { manilaDay as doseWatchDay } from '../dose-watch/logic.ts'
import { buildDigest, type DigestRow, KINDS, manilaDay, officialFailed, type Port, runDigest } from './logic.ts'

const NOW = Date.parse('2026-11-04T22:45:00Z') // 06:45 on 2026-11-05 in Manila
const H = 3_600_000
const ago = (h: number) => new Date(NOW - h * H).toISOString()
const FRESH = { at: ago(0.2), failed: 0 }
const r = (id: string, kind: string, hoursAgo: number, o: Partial<DigestRow> = {}): DigestRow => ({ id, kind, level: 'L', title: `Title ${id}`, source: 'PAGASA', issued_at: ago(hoursAgo), ...o })

describe('manilaDay', () => {
  it('06:45 Manila is the same Manila day as the row the cron writes; 23:30 and 00:30 local (ML-38)', () => {
    expect(manilaDay(NOW)).toBe('2026-11-05')
    expect(manilaDay(Date.parse('2026-11-05T15:30:00Z'))).toBe('2026-11-05') // 23:30
    expect(manilaDay(Date.parse('2026-11-05T16:30:00Z'))).toBe('2026-11-06') // 00:30 next day
  })
  it('equals the dose-watch helper (ML-10)', () => {
    for (const t of [NOW, Date.parse('2026-11-05T15:59:59Z'), Date.parse('2026-11-05T16:00:00Z'), Date.parse('2027-01-01T00:00:00Z')]) expect(manilaDay(t)).toBe(doseWatchDay(t))
  })
})

describe('buildDigest', () => {
  it('an empty day says so, and counts every kind as 0', () => {
    const d = buildDigest([], FRESH, NOW)
    expect(d.summary).toBe('No warnings in the last 24 h.')
    expect(d.top).toEqual([])
    expect(d.day).toBe('2026-11-05')
    expect(Object.keys(d.counts)).toEqual([...KINDS])
    expect(Object.values(d.counts).every((n) => n === 0)).toBe(true)
    expect(d.sources).toBe('Checked: PAGASA, USGS and GDACS.') // EONET and Open-Meteo are named only when the heartbeat says they passed
    expect(buildDigest([], { ...FRESH, eonetOk: true, airOk: true }, NOW).sources).toBe('Checked: PAGASA, USGS, GDACS, EONET and Open-Meteo.')
    expect(buildDigest([], { ...FRESH, eonetOk: false, airOk: true }, NOW).sources).toBe('Checked: PAGASA, USGS, GDACS and Open-Meteo.')
  })
  it('an empty day is NOT called quiet when the ingest did not run lately or a source failed: nobody looked', () => {
    for (const run of [null, { at: ago(3.1), failed: 0 }, { at: 'junk', failed: 0 }, { at: ago(0.2), failed: 1 }]) expect(buildDigest([], run, NOW).summary, JSON.stringify(run)).toBe('Some warning feeds were not checked recently, so this may be missing some.')
    expect(buildDigest([], { at: ago(3), failed: 0 }, NOW).summary).toBe('No warnings in the last 24 h.') // 3 h exactly is still fresh
  })
  it('the sources line never claims a check that did not happen', () => {
    expect(buildDigest([], null, NOW).sources).toBe('No feed check could be confirmed.')
    expect(buildDigest([], { at: ago(1), failed: 1 }, NOW).sources).toBe('No feed check could be confirmed.')
    expect(buildDigest([], { at: ago(9), failed: 0 }, NOW).sources).toBe('No feed check could be confirmed.')
    expect(buildDigest([], FRESH, NOW).sources).toMatch(/^Checked: /)
    expect(buildDigest([r('a', 'tcws', 1)], null, NOW).sources).toBe('From PAGASA.') // names the rows' own source, which is true
  })
  it('officialFailed counts only PAGASA, USGS and GDACS, falls back to the old count, and treats an unreadable summary as not clean', () => {
    expect(officialFailed({ pagasa_ok: true, usgs_ok: true, gdacs_ok: true, sources_failed: 2 })).toBe(0)
    expect(officialFailed({ pagasa_ok: false, usgs_ok: true, gdacs_ok: false })).toBe(2)
    expect(officialFailed({ sources_failed: 0 })).toBe(0)
    expect(officialFailed({ sources_failed: 3 })).toBe(3)
    for (const bad of [null, undefined, {}, { pagasa_ok: true }, { sources_failed: 'x' }]) expect(officialFailed(bad as never), JSON.stringify(bad)).toBe(1)
  })
  it('counts per kind in the 24 h window only: 24 h exactly is in, 24 h and a second is out, a row from the future is out', () => {
    const d = buildDigest([r('a', 'quake', 24), r('b', 'quake', 24.001), r('c', 'tcws', 1), r('d', 'quake', -2)], FRESH, NOW)
    expect(d.counts.quake).toBe(1)
    expect(d.counts.tcws).toBe(1)
    expect(d.summary).toBe('2 warnings in the last 24 h.')
  })
  it('a notice issued 3 days ago but still in force is counted; one that has expired is not', () => {
    const live = r('cyclone', 'gdacs', 72, { expires_at: new Date(NOW + 5 * H).toISOString() })
    const gone = r('old', 'gdacs', 72, { expires_at: new Date(NOW - 1).toISOString() })
    const d = buildDigest([live, gone], FRESH, NOW)
    expect(d.counts.gdacs).toBe(1)
    expect(d.top.map((t) => t.id)).toEqual(['cyclone'])
    expect(d.summary).toBe('1 GDACS event in or near the Philippines in the last 24 h (not an official warning). No other warnings listed.') // GDACS is context, never a flat "No warnings"
    const green = buildDigest([r('v', 'volcano', 1, { source: 'GDACS', level: 'Green' })], FRESH, NOW) // R8: a Green GDACS volcano is context too
    expect(green.summary).toBe('1 GDACS event in or near the Philippines in the last 24 h (not an official warning). No other warnings listed.')
    expect(buildDigest([r('v', 'volcano', 1, { source: 'GDACS', level: 'Orange' })], FRESH, NOW).summary).toBe('1 warning in the last 24 h.')
    expect(buildDigest([r('g', 'gdacs', 1, { source: 'GDACS' })], { at: ago(5), failed: 0 }, NOW).summary).toBe('1 GDACS event in or near the Philippines in the last 24 h (not an official warning). Some warning feeds were not checked recently, so this may be missing some.')
  })
  it('EONET rows are counted but are not "warnings" in the summary', () => {
    const d = buildDigest([r('e', 'eonet', 1, { source: 'EONET' })], FRESH, NOW)
    expect(d.counts.eonet).toBe(1)
    expect(d.summary).toBe('No warnings in the last 24 h.')
  })
  it('only the air rows fresh while another source failed: not a quiet day', () => {
    expect(buildDigest([], { at: ago(0.1), failed: 3 }, NOW).summary).toBe('Some warning feeds were not checked recently, so this may be missing some.')
    expect(buildDigest([r('a', 'tcws', 1)], { at: ago(0.1), failed: 1 }, NOW).summary).toBe('1 warning in the last 24 h. Some warning feeds were not checked recently, so this may be missing some.')
  })
  it('one warning is singular', () => expect(buildDigest([r('a', 'tcws', 1)], FRESH, NOW).summary).toBe('1 warning in the last 24 h.'))
  it('does not count a lifted or ended notice, or an air reading under the threshold', () => {
    const d = buildDigest([
      r('lifted', 'tcws', 2, { level: null, title: 'Wind signal lifted' }), r('ended', 'rainfall', 2, { level: null }),
      r('air-ok', 'air', 1, { title: 'Air quality: no warning' }), r('air-bad', 'air', 1, { title: 'Air quality: Unhealthy' })
    ], FRESH, NOW)
    expect(d.counts).toMatchObject({ tcws: 0, rainfall: 0, air: 1 })
    expect(d.top.map((t) => t.id)).toEqual(['air-bad'])
  })
  it('ignores a kind it does not know instead of inventing a count', () => {
    const d = buildDigest([r('x', 'meteor', 1), r('y', 'quake', 1)], FRESH, NOW)
    expect(Object.keys(d.counts)).not.toContain('meteor')
    expect(d.counts.quake).toBe(1)
  })
  it('top 5 by rank: official weather first, then quake, volcano, air, gdacs, eonet last; newest first inside a tier', () => {
    const rows = [
      r('eo', 'eonet', 1, { source: 'EONET' }), r('gd', 'gdacs', 1, { source: 'GDACS' }), r('air', 'air', 1, { source: 'Open-Meteo' }), r('vo', 'volcano', 1),
      r('q-old', 'quake', 10, { source: 'USGS' }), r('q-new', 'quake', 2, { source: 'USGS' }), r('rain', 'rainfall', 5), r('wind', 'tcws', 8)
    ]
    const d = buildDigest(rows, FRESH, NOW)
    expect(d.top.map((t) => t.id)).toEqual(['rain', 'wind', 'vo', 'q-new', 'q-old']) // rainfall (newer) before tcws, same tier 0; volcano shares the quake tier and is the newest there
    expect(d.top).toHaveLength(5)
    expect(d.counts.eonet).toBe(1) // beyond the top 5 but counted
    expect(d.top[0]).toEqual({ id: 'rain', title: 'Title rain', kind: 'rainfall', level: 'L', source: 'PAGASA' })
  })
  it('the source line names the sources of the counted rows, sorted, and nothing else', () => {
    const d = buildDigest([r('a', 'quake', 1, { source: 'USGS' }), r('b', 'tcws', 1), r('c', 'quake', 2, { source: 'USGS' })], FRESH, NOW)
    expect(d.sources).toBe('From PAGASA, USGS.')
  })
  it('a long title is clipped; the body holds counts and public titles only (no key beyond the contract)', () => {
    const d = buildDigest([r('a', 'tcws', 1, { title: 'x'.repeat(500) })], FRESH, NOW)
    expect(d.top[0].title).toHaveLength(160)
    expect(Object.keys(d).sort()).toEqual(['counts', 'day', 'sources', 'summary', 'top'])
    expect(Object.keys(d.top[0]).sort()).toEqual(['id', 'kind', 'level', 'source', 'title'])
  })
  it('the contract list of kinds equals the ingest and app lists (ML-28)', () => {
    const app = readFileSync(new URL('../../../src/features/safety/alerts.ts', import.meta.url), 'utf8')
    const union = /export type AlertKind = ([^\n]+)/.exec(app)![1].match(/'(\w+)'/g)!.map((s) => s.slice(1, -1)).sort()
    expect([...KINDS].sort()).toEqual(union)
    const mig = readFileSync(new URL('../../migrations/0048_alert_tiers.sql', import.meta.url), 'utf8')
    const check = /check \(kind in \(([^)]+)\)\)/.exec(mig)![1].match(/'(\w+)'/g)!.map((s) => s.slice(1, -1)).sort()
    expect(check).toEqual(union)
  })
})

describe('runDigest', () => {
  function port(rows: DigestRow[], run: { at: string | null; failed: number } | null = FRESH) {
    const log = { upserts: [] as { day: string; summary: string }[], pruned: [] as string[], since: [] as string[] }
    const p: Port = {
      rows: async (s) => { log.since.push(s); return rows },
      lastRun: async () => run,
      upsert: async (day, body) => void log.upserts.push({ day, summary: body.summary }),
      prune: async (d) => void log.pruned.push(d)
    }
    return { p, log }
  }
  it('reads the last 24 h, writes one row for the Manila day and prunes digests older than 30 days', async () => {
    const { p, log } = port([r('a', 'tcws', 1)])
    const d = await runDigest(p, NOW)
    expect(log.since).toEqual(['2026-11-03T22:45:00.000Z'])
    expect(log.upserts).toEqual([{ day: '2026-11-05', summary: '1 warning in the last 24 h.' }])
    expect(log.pruned).toEqual(['2026-10-06'])
    expect(d.day).toBe('2026-11-05')
  })
  it('a failing prune does not fail the digest; a failing read or write does', async () => {
    const { p } = port([])
    p.prune = async () => { throw new Error('x') }
    await expect(runDigest(p, NOW)).resolves.toMatchObject({ summary: 'No warnings in the last 24 h.' })
    const bad = port([]).p
    bad.rows = async () => { throw new Error('read') }
    await expect(runDigest(bad, NOW)).rejects.toThrow('read')
    const bad2 = port([]).p
    bad2.upsert = async () => { throw new Error('write') }
    await expect(runDigest(bad2, NOW)).rejects.toThrow('write')
  })
  it('running twice on one day writes the same day key (an upsert, not a second row)', async () => {
    const { p, log } = port([])
    await runDigest(p, NOW)
    await runDigest(p, NOW + 600_000)
    expect(new Set(log.upserts.map((u) => u.day)).size).toBe(1)
  })
})
