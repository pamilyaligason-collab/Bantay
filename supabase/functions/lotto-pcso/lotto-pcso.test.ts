// @vitest-environment node
// The fixture follows the real lottopcso.com table shapes; most draw numbers are the public 6-8 Nov 2026 results (public draw data, no personal data), some amounts and all skip-rule rows are invented. Expected values are hand-counted, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { isoDate, parseResults, runLotto, SOURCE_URL } from './lotto.ts'

const html = readFileSync(new URL('./fixtures/results.html', import.meta.url), 'utf8')
const NOW = Date.parse('2026-11-08T02:00:00Z')

describe('parseResults', () => {
  const rows = parseResults(html, NOW)!
  const keys = rows.map((r) => `${r.game}|${r.draw_date}`)
  it('keeps the nine good rows once each (the repeated 6/45 table is one row); STL and side tables are ignored', () => {
    expect(keys).toEqual([
      '3D 2PM|2026-11-08', '2D 2PM|2026-11-08', '6/58 Ultra Lotto|2026-11-06', '6/55 Grand Lotto|2026-11-07', '6/49 Super Lotto|2026-11-05',
      '6/45 Mega Lotto|2026-11-06', '6/42 Lotto|2026-11-07', '4D|2026-11-06', '6D|2026-11-07'
    ])
  })
  it('reads combination, jackpot (cents kept) and winners; unknown stays null, not 0', () => {
    expect(rows[3]).toEqual({ game: '6/55 Grand Lotto', draw_date: '2026-11-07', combination: '22-43-34-12-06-27', jackpot_php: 31250400.5, winners: 1 })
    expect(rows[2]).toMatchObject({ jackpot_php: 489846673.65, winners: 0 })
    expect(rows[7]).toEqual({ game: '4D', draw_date: '2026-11-06', combination: '2-5-0-5', jackpot_php: 38542, winners: 22 })
    expect(rows[0]).toEqual({ game: '3D 2PM', draw_date: '2026-11-08', combination: '4-3-8', jackpot_php: null, winners: null })
    const star = parseResults(html.replace('Number of Winner(s)</td><td>12', 'Number of Winner(s)</td><td>*'), NOW)!
    expect(star.find((r) => r.game === '6D')!.winners).toBeNull()
  })
  it('skips (never repairs): stand-by numbers, a space typo, repeated ball, ball over the maximum, wrong draw day, future, older than 14 days, unreadable date, wrong draw time, wrong digit count', () => {
    for (const bad of ['6/58 Ultra Lotto|2026-11-08', '6/49 Super Lotto|2026-11-03', '6/55 Grand Lotto|2026-11-04', '6/42 Lotto|2026-11-03', '6/45 Mega Lotto|2026-11-05', '6/58 Ultra Lotto|2026-11-10', '6/55 Grand Lotto|2026-10-14', '4D|2026-11-05', '6D|2026-11-05'])
      expect(keys).not.toContain(bad)
    expect(keys.some((k) => k.startsWith('STL'))).toBe(false)
    expect(rows.filter((r) => r.game.startsWith('6/49'))).toHaveLength(1) // "Soon" is dropped too
  })
  it('the 14-day edge: a Sunday 6/58 exactly 14 days old stays, a Saturday 6/55 15 days old goes; the Manila date, not UTC, decides "tomorrow"', () => {
    const one = (g: string, d: string) => `<table><tr><th>${g}</th><th>${d}</th></tr><tr><td>Winning Combination</td><td>01-02-03-04-05-06</td></tr></table>`
    expect(parseResults(one('6/58 Ultra Lotto', 'October 25, 2026'), NOW)).toHaveLength(1)
    expect(parseResults(one('6/55 Grand Lotto', 'October 24, 2026'), NOW)).toEqual([])
    expect(parseResults(one('6/55 Grand Lotto', 'November 9, 2026'), Date.parse('2026-11-08T15:00:00Z'))).toEqual([]) // 23:00 on the 8th in Manila
    expect(parseResults(one('6/55 Grand Lotto', 'November 9, 2026'), Date.parse('2026-11-08T16:30:00Z'))).toHaveLength(1) // 00:30 on the 9th
  })
  it('the same draw with two different combinations is dropped, not guessed', () => {
    const two = html + '<table><tr><th>6/42 Lotto</th><th>November 7, 2026</th></tr><tr><td>Winning Combination</td><td>01-02-03-04-05-06</td></tr></table>'
    expect(parseResults(two, NOW)!.some((r) => r.game === '6/42 Lotto')).toBe(false)
  })
  it('a page without any game table is a failure (null); tables with nothing valid give an empty list', () => {
    for (const bad of [null, 5, '', '<html>Service Unavailable</html>', '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>']) expect(parseResults(bad, NOW)).toBeNull()
    expect(parseResults('<table><tr><th>6/58 Ultra Lotto</th><th>November 8, 2026</th></tr><tr><td>Winning Combination</td><td>Stand by</td></tr></table>', NOW)).toEqual([])
  })
})

describe('isoDate', () => {
  it('reads "November 8, 2026" and yyyy-mm-dd; rejects 31 Feb, junk and a short month name', () => {
    expect(isoDate('November 8, 2026')).toBe('2026-11-08')
    expect(isoDate('2026-02-28')).toBe('2026-02-28')
    expect(isoDate('February 31, 2026')).toBeNull()
    expect(isoDate('Soon')).toBeNull()
    expect(isoDate('Nov 8, 2026')).toBeNull()
  })
})

describe('runLotto', () => {
  it('upserts the valid rows, trims rows older than 30 days, returns the count', async () => {
    const port = { upsert: vi.fn(async (_r: { fetched_at: string }[]) => undefined), purge: vi.fn(async (_d: string) => undefined) }
    const fetchText = vi.fn(async (_u: string) => html)
    expect(await runLotto(port, fetchText, NOW)).toEqual({ ok: true, rows: 9 })
    expect(fetchText).toHaveBeenCalledWith(SOURCE_URL)
    expect(port.upsert.mock.calls[0]![0]).toHaveLength(9)
    expect(port.upsert.mock.calls[0]![0].every((r) => r.fetched_at === '2026-11-08T02:00:00.000Z')).toBe(true)
    expect(port.purge).toHaveBeenCalledWith('2026-10-09')
  })
  it('a page with tables but no valid draw is a failure (the function answers non-200) and writes and trims nothing', async () => {
    const port = { upsert: vi.fn(async (_r: unknown[]) => undefined), purge: vi.fn(async (_d: string) => undefined) }
    const stale = '<table><tr><th>6/58 Ultra Lotto</th><th>November 8, 2026</th></tr><tr><td>Winning Combination</td><td>Stand by</td></tr></table>'
    expect(await runLotto(port, async () => stale, NOW)).toEqual({ ok: false, rows: 0 })
    expect(port.upsert).not.toHaveBeenCalled()
    expect(port.purge).not.toHaveBeenCalled()
  })
  it('an unreadable page writes and trims nothing', async () => {
    const port = { upsert: vi.fn(async (_r: unknown[]) => undefined), purge: vi.fn(async (_d: string) => undefined) }
    expect(await runLotto(port, async () => '<html>429</html>', NOW)).toEqual({ ok: false, rows: 0 })
    expect(port.upsert).not.toHaveBeenCalled()
    expect(port.purge).not.toHaveBeenCalled()
  })
})

describe('index.ts wiring (source guard: the function itself needs Deno)', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  it('checks the secret before any work, sends the agreed User-Agent, never chains .catch on a supabase builder', () => {
    expect(src.indexOf("Deno.env.get('LOTTO_CRON_SECRET')")).toBeLessThan(src.indexOf('createClient('))
    expect(src).toContain('x-lotto-secret')
    expect(src).toContain('secret.length < 32')
    expect(src).toContain("'User-Agent': 'FamilyBantay/1.0 (+results card)'")
    expect(SOURCE_URL).toBe('https://www.lottopcso.com/')
    expect(src).not.toMatch(/sb\.[\s\S]{0,80}\.catch\(/)
    expect(src).toContain("heartbeat(sb, 'lotto-pcso'")
  })
  it('the source is the lottopcso.com home page; an Access Denied page (what PCSO itself serves a server) parses to null', () => {
    expect(parseResults('<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>Access Denied</BODY></HTML>', NOW)).toBeNull()
  })
})
