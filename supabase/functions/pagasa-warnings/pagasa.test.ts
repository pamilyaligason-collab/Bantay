// @vitest-environment node
// Fixtures: bulletin-active.html, advisory-none.html and home-alerts.html are trimmed copies of the public PAGASA pages saved 9 Nov 2026 (no personal data). The others are marked SYNTHETIC in their first line:
// the wind-signal wording, an active advisory, the "no cyclone" page and extra home labels were not on the live pages that day. Expected values are hand-read, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ADVISORY_URL, BULLETIN_URL, type DbRow, HOME_URL, manilaIso, parseAdvisory, parseBulletins, parseHome, parseSignals, runPagasa } from './pagasa.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')

describe('parseBulletins', () => {
  it('reads the real active bulletin: name, number, issue time in Manila, centre, no signal', () => {
    const p = parseBulletins(fx('bulletin-active.html'))!
    expect(p.errors).toBe(0)
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]).toMatchObject({
      kind: 'tropical_cyclone',
      title: 'Typhoon "Samuel" - Tropical Cyclone Bulletin #1',
      issued_at: '2026-11-09T03:00:00.000Z', // 11:00 am Manila = 03:00 UTC
      signals: [],
      source_url: BULLETIN_URL
    })
    expect(p.rows[0]!.areas).toContain('1,370 km East Northeast of Extreme Northern Luzon')
    expect(p.rows[0]!.areas).not.toContain('Movement')
  })
  it('reads wind signals by level with their area text, highest first', () => {
    const r = parseBulletins(fx('bulletin-signals.html'))!.rows[0]!
    expect(r.signals).toEqual([
      { level: 2, areas: 'Luzon: Batanes, Cagayan including Babuyan Islands, Isabela' },
      { level: 1, areas: 'Luzon: Ilocos Norte, Apayao, Kalinga' }
    ])
  })
  it('reads only the Wind Signal panel: a later panel with Wind Signal text is ignored', () => {
    const r = parseBulletins(fx('bulletin-signals-later-panel.html'))!.rows[0]!
    expect(r.signals.map((x) => x.level)).toEqual([2, 1])
  })
  it('merges island groups of one level into one entry, so signals never exceed 5', () => {
    expect(parseSignals('Wind Signal No. 2 Luzon: Batanes Wind Signal No. 1 Luzon: Apayao Wind Signal No. 2 Visayas: Samar Wind Signal No. 1 Visayas: Leyte Wind Signal No. 2 Mindanao: Surigao Wind Signal No. 1 Mindanao: Dinagat Wind Signal No. 1 Luzon: Apayao')).toEqual([
      { level: 2, areas: 'Luzon: Batanes Visayas: Samar Mindanao: Surigao' },
      { level: 1, areas: 'Luzon: Apayao Visayas: Leyte Mindanao: Dinagat' }
    ])
  })
  it('drops a bulletin whose signal text cannot be read instead of showing "no signal"', () => {
    const p = parseBulletins(fx('bulletin-unreadable-signal.html'))!
    expect(p.rows).toEqual([])
    expect(p.errors).toBe(1)
  })
  it('the page shell with no tabs is "no active cyclone"; a shell that still has a signal block or tabs is an error; another page is null', () => {
    expect(parseBulletins(fx('bulletin-none.html'))).toEqual({ rows: [], errors: 0 })
    const tabsGone = fx('bulletin-active.html').replace(/<div role="tabpanel"[^>]*id="tcwb-1">/, '<div>')
    expect(parseBulletins(tabsGone)).toEqual({ rows: [], errors: 1 })
    expect(parseBulletins('<html><body>Page not found</body></html>')).toBeNull()
    expect(parseBulletins(undefined)).toBeNull()
  })
})

describe('parseSignals / manilaIso', () => {
  it('needs a level and an area for each marker', () => {
    expect(parseSignals('TCWS No. 3 Eastern Samar TCWS #5 Batanes')).toEqual([{ level: 5, areas: 'Batanes' }, { level: 3, areas: 'Eastern Samar' }])
    expect(parseSignals('Wind Signal 2')).toBeNull() // a level with no area is not a reading
    expect(parseSignals('Signal over Luzon')).toBeNull()
  })
  it('converts Manila clock time and refuses impossible ones', () => {
    expect(manilaIso('12', '30', 'am', '10', 'November', '2026')).toBe('2026-11-09T16:30:00.000Z')
    expect(manilaIso('12', '00', 'pm', '10', 'November', '2026')).toBe('2026-11-10T04:00:00.000Z')
    expect(manilaIso('5', '00', 'PM', '9', 'november', '2026')).toBe('2026-11-09T09:00:00.000Z')
    expect(manilaIso('13', '00', 'am', '9', 'November', '2026')).toBeNull()
    expect(manilaIso('5', '60', 'pm', '9', 'November', '2026')).toBeNull()
    expect(manilaIso('5', '00', 'pm', '31', 'November', '2026')).toBeNull()
    expect(manilaIso('5', '00', 'pm', '9', 'Smarch', '2026')).toBeNull()
  })
})

describe('parseAdvisory', () => {
  it('"no Weather Advisory issued" is zero rows', () => {
    expect(parseAdvisory(fx('advisory-none.html'))).toEqual({ rows: [], errors: 0 })
  })
  it('an advisory text is one row with its title, issue time and text', () => {
    const p = parseAdvisory(fx('advisory-active.html'))!
    expect(p.errors).toBe(0)
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]).toMatchObject({ kind: 'advisory', title: 'Weather Advisory No. 3', issued_at: '2026-11-09T09:00:00.000Z', source_url: ADVISORY_URL, signals: [] })
    expect(p.rows[0]!.areas).toContain('Moderate to heavy rains are expected over Metro Manila and Rizal')
    expect(p.rows[0]!.areas).not.toContain('survey')
  })
  it('an empty body is an error, another page is null', () => {
    const empty = fx('advisory-none.html').replace(/<p>As of today[^<]*<\/p>/, '')
    expect(parseAdvisory(empty)).toEqual({ rows: [], errors: 1 })
    expect(parseAdvisory('<html>Page not found</html>')).toBeNull()
  })
})

describe('parseHome', () => {
  it('the real block lists only a cyclone alert: no row (the bulletin page owns cyclones)', () => {
    expect(parseHome(fx('home-alerts.html'))).toEqual({ rows: [], errors: 0 })
  })
  it('maps labels: rainfall and thunderstorm to rainfall, others to advisory, repeats once, stops at the news tab', () => {
    const p = parseHome(fx('home-alerts-multi.html'))!
    expect(p.rows.map((r) => [r.kind, r.title])).toEqual([['rainfall', 'Orange Rainfall Warning'], ['rainfall', 'Thunderstorm Advisory'], ['advisory', 'Gale Warning']])
    expect(p.rows.every((r) => r.source_url === HOME_URL && r.issued_at === null)).toBe(true)
  })
  it('no block is null', () => {
    expect(parseHome('<html>x</html>')).toBeNull()
  })
})

describe('runPagasa', () => {
  const NOW = Date.parse('2026-11-09T04:00:00Z')
  const pages: Record<string, string> = { [BULLETIN_URL]: fx('bulletin-active.html'), [ADVISORY_URL]: fx('advisory-none.html'), [HOME_URL]: fx('home-alerts-multi.html') }
  const port = () => ({ upsert: vi.fn(async (_r: DbRow[]) => {}), purge: vi.fn(async (_b: string) => {}) })

  it('stores the cyclone and the home rows once each with fetched_at, purges at 14 days', async () => {
    const p = port()
    const res = await runPagasa(p, async (u) => pages[u]!, NOW)
    expect(res).toEqual({ ok: true, rows: 4, failed: [] })
    const rows = p.upsert.mock.calls[0]![0]
    expect(rows.map((r) => r.dedupe_key)).toEqual([
      'tropical_cyclone|Typhoon "Samuel" - Tropical Cyclone Bulletin #1|2026-11-09T03:00:00.000Z',
      'rainfall|Orange Rainfall Warning|',
      'rainfall|Thunderstorm Advisory|',
      'advisory|Gale Warning|'
    ])
    expect(rows.every((r) => r.fetched_at === '2026-11-09T04:00:00.000Z')).toBe(true)
    expect(p.purge).toHaveBeenCalledWith('2026-10-26T04:00:00.000Z')
  })
  it('a page that cannot be fetched or read stores nothing for it, the others still store, and the run is not ok', async () => {
    const p = port()
    const res = await runPagasa(p, async (u) => { if (u === BULLETIN_URL) throw new Error('HTTP503'); return u === ADVISORY_URL ? '<html>Page not found</html>' : pages[u]! }, NOW)
    expect(res).toEqual({ ok: false, rows: 3, failed: ['bulletin', 'advisory'] })
    expect(p.upsert.mock.calls[0]![0].some((r) => r.kind === 'tropical_cyclone')).toBe(false)
  })
  it('an unreadable signal drops that bulletin and fails the run', async () => {
    const p = port()
    const res = await runPagasa(p, async (u) => (u === BULLETIN_URL ? fx('bulletin-unreadable-signal.html') : pages[u]!), NOW)
    expect(res.failed).toEqual(['bulletin'])
    expect(res.ok).toBe(false)
    expect(p.upsert.mock.calls[0]![0].some((r) => r.kind === 'tropical_cyclone')).toBe(false)
  })
  it('all pages failing writes and purges nothing', async () => {
    const p = port()
    const res = await runPagasa(p, async () => { throw new Error('offline') }, NOW)
    expect(res).toEqual({ ok: false, rows: 0, failed: ['bulletin', 'advisory', 'home'] })
    expect(p.upsert).not.toHaveBeenCalled()
    expect(p.purge).not.toHaveBeenCalled()
  })
})
