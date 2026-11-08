// @vitest-environment node
// The fixture is an invented copy of the PCSO table shape; expected values are hand-counted, not copied from the parser.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { isoDate, parseResults, runLotto, SOURCE_URL } from './lotto.ts'

const html = readFileSync(new URL('./fixtures/results.html', import.meta.url), 'utf8')
const NOW = Date.parse('2026-11-08T02:00:00Z')

describe('parseResults', () => {
  const rows = parseResults(html)!
  it('reads the seven good rows; drops a non-number combination, an impossible date and a short row', () => {
    expect(rows.map((r) => `${r.game}|${r.draw_date}`)).toEqual([
      'Ultra Lotto 6/58|2026-11-06', 'Grand Lotto 6/55|2026-11-07', 'Super Lotto 6/49|2026-11-05', 'Mega Lotto 6/45|2026-11-04', 'Lotto 6/42|2026-11-07', '3D Lotto 9PM|2026-11-07', 'Lotto 6/42|2026-09-01'
    ])
  })
  it('reads combination, jackpot and winners; the jackpot keeps its cents', () => {
    expect(rows[1]).toEqual({ game: 'Grand Lotto 6/55', draw_date: '2026-11-07', combination: '05-12-22-27-34-43', jackpot_php: 31250400.5, winners: 1 })
    expect(rows[0]!.winners).toBe(0)
    expect(rows[5]).toMatchObject({ combination: '4-4-7', winners: 12 })
  })
  it('an unreadable jackpot or winners count is null, not 0', () => {
    const r = parseResults('<table><tr><th>LOTTO GAME</th><th>COMBINATIONS</th></tr><tr><td>Lotto 6/42</td><td>1-2-3-4-5-6</td><td>11/7/2026</td><td>n/a</td><td>-</td></tr></table>')!
    expect(r).toEqual([{ game: 'Lotto 6/42', draw_date: '2026-11-07', combination: '1-2-3-4-5-6', jackpot_php: null, winners: null }])
  })
  it('a repeated game and date keeps one row', () => {
    const two = html.replace('</table>', '<tr><td>Lotto 6/42</td><td>04-18-19-23-28-34</td><td>11/7/2026</td><td>1.00</td><td>0</td></tr></table>')
    expect(parseResults(two)!.filter((r) => r.game === 'Lotto 6/42' && r.draw_date === '2026-11-07')).toHaveLength(1)
  })
  it('a page without the results table is a failure; a table with no rows is a quiet answer', () => {
    for (const bad of [null, 5, '', '<html>Service Unavailable</html>']) expect(parseResults(bad)).toBeNull()
    expect(parseResults('<table><tr><th>LOTTO GAME</th><th>COMBINATIONS</th></tr></table>')).toEqual([])
  })
})

describe('isoDate', () => {
  it('reads m/d/yyyy and yyyy-mm-dd; rejects 31 Feb and junk', () => {
    expect(isoDate('11/7/2026')).toBe('2026-11-07')
    expect(isoDate('2026-02-28')).toBe('2026-02-28')
    expect(isoDate('2/31/2026')).toBeNull()
    expect(isoDate('soon')).toBeNull()
  })
})

describe('runLotto', () => {
  it('upserts rows within 30 days (the 1 September row is out), trims older, returns the count', async () => {
    const port = { upsert: vi.fn(async (_r: { fetched_at: string }[]) => undefined), purge: vi.fn(async (_d: string) => undefined) }
    const fetchText = vi.fn(async (_u: string) => html)
    expect(await runLotto(port, fetchText, NOW)).toEqual({ ok: true, rows: 6 })
    expect(fetchText).toHaveBeenCalledWith(SOURCE_URL)
    expect(port.upsert.mock.calls[0]![0]).toHaveLength(6)
    expect(port.upsert.mock.calls[0]![0].every((r) => r.fetched_at === '2026-11-08T02:00:00.000Z')).toBe(true)
    expect(port.purge).toHaveBeenCalledWith('2026-10-09')
  })
  it('an unreadable page writes and trims nothing', async () => {
    const port = { upsert: vi.fn(async (_r: unknown[]) => undefined), purge: vi.fn(async (_d: string) => undefined) }
    expect(await runLotto(port, async () => '<html>429</html>', NOW)).toEqual({ ok: false, rows: 0 })
    expect(port.upsert).not.toHaveBeenCalled()
    expect(port.purge).not.toHaveBeenCalled()
  })
})
