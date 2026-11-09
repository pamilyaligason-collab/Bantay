import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  result: { data: [] as unknown[] | null, error: null as unknown },
  next: { data: [] as unknown[] | null, error: null as unknown },
  saved: undefined as undefined | { value: unknown },
  put: vi.fn(async (_v: unknown) => undefined),
  connected: true
}))
vi.mock('../../db', () => ({ db: { kv: { get: async () => h.saved, put: (v: unknown) => h.put(v) } } }))
vi.mock('../auth/client', () => ({
  get supabase() { return h.connected ? { from: (t: string) => ({ select: () => ({ order: () => ({ limit: async () => (t === 'lotto_next_jackpot' ? h.next : h.result) }) }) }) } : null }
}))
import { latestPerGame, loadLotto, loadNextJackpots, nextJackpotFor, type LottoRow } from './lottoApi'

const row = (game: string, draw_date: string, combination = '1-2-3-4-5-6'): LottoRow => ({ game, draw_date, combination, jackpot_php: null, winners: null })
const NOW = Date.parse('2026-11-08T02:00:00Z')
afterEach(() => { h.result = { data: [], error: null }; h.next = { data: [], error: null }; h.saved = undefined; h.put.mockClear(); h.connected = true })

describe('latestPerGame', () => {
  it('keeps the newest draw of each game in the order 6/58, 6/55, 6/49, 6/45, 6/42, 3D (newest draw); other games are left out', () => {
    const out = latestPerGame([
      row('Lotto 6/42', '2026-11-05'), row('Lotto 6/42', '2026-11-07'), row('3D Lotto 2PM', '2026-11-07'), row('3D Lotto 9PM', '2026-11-06'),
      row('Ultra Lotto 6/58', '2026-11-03'), row('6Digit', '2026-11-07'), row('Mega Lotto 6/45', '2026-11-04')
    ])
    expect(out.map((x) => `${x.game}|${x.draw_date}`)).toEqual(['Ultra Lotto 6/58|2026-11-03', 'Mega Lotto 6/45|2026-11-04', 'Lotto 6/42|2026-11-07', '3D Lotto 2PM|2026-11-07'])
  })
  it('takes the names lotto-pcso stores from the lottopcso.com page (D-153)', () => {
    const out = latestPerGame([row('6/58 Ultra Lotto', '2026-11-06'), row('6/42 Lotto', '2026-11-07'), row('3D 2PM', '2026-11-08'), row('3D 9PM', '2026-11-07'), row('4D', '2026-11-06'), row('2D 9PM', '2026-11-07')])
    expect(out.map((x) => x.game)).toEqual(['6/58 Ultra Lotto', '6/42 Lotto', '3D 2PM'])
  })
  it('3D: before the 9 PM draw posts the latest posted draw shows (yesterday 9PM when nothing newer), and on the same day the later draw wins', () => {
    expect(latestPerGame([row('3D 9PM', '2026-11-07'), row('3D 5PM', '2026-11-07'), row('3D 2PM', '2026-11-07')]).map((x) => x.game)).toEqual(['3D 9PM'])
    expect(latestPerGame([row('3D 2PM', '2026-11-08'), row('3D 9PM', '2026-11-07')]).map((x) => x.game)).toEqual(['3D 2PM'])
    expect(latestPerGame([row('3D 9PM', '2026-11-07')]).map((x) => `${x.game}|${x.draw_date}`)).toEqual(['3D 9PM|2026-11-07'])
  })
})

describe('loadLotto', () => {
  it('reads rows, drops malformed ones, and saves the list', async () => {
    h.result = { data: [row('Lotto 6/42', '2026-11-07', '04-18-19-23-28-33'), { game: 'x', draw_date: 'soon', combination: '1-2' }, row('Lotto 6/45', '2026-11-07', 'abc')], error: null }
    const rows = await loadLotto(NOW)
    expect(rows!.map((x) => x.game)).toEqual(['Lotto 6/42'])
    expect(h.put).toHaveBeenCalledWith({ key: 'today.lotto', value: { savedAt: NOW, rows } })
  })
  it('a failed read falls back to the saved copy while it is under 30 days old, else null', async () => {
    h.result = { data: null, error: { message: 'x' } }
    h.saved = { value: { savedAt: NOW - 5 * 86_400_000, rows: [row('Lotto 6/42', '2026-11-03')] } }
    expect(await loadLotto(NOW)).toHaveLength(1)
    h.saved = { value: { savedAt: NOW - 31 * 86_400_000, rows: [row('Lotto 6/42', '2026-10-01')] } }
    expect(await loadLotto(NOW)).toBeNull()
    h.saved = undefined
    expect(await loadLotto(NOW)).toBeNull()
  })
  it('not connected is the saved copy or null, and nothing is saved', async () => {
    h.connected = false
    expect(await loadLotto(NOW)).toBeNull()
    expect(h.put).not.toHaveBeenCalled()
  })
})

describe('jackpot', () => {
  it('loadLotto keeps a real six-number jackpot, turns a placeholder, a string or a missing value into null, and leaves 4D alone', async () => {
    h.result = { data: [
      { ...row('6/58 Ultra Lotto', '2026-11-06', '09-26-10-04-02-47'), jackpot_php: 489846673.65 },
      { ...row('6/49 Super Lotto', '2026-11-05', '10-46-40-39-04-16'), jackpot_php: 1 },
      { ...row('6/45 Mega Lotto', '2026-11-06', '45-39-38-13-05-21'), jackpot_php: '15000000' },
      { ...row('6/42 Lotto', '2026-11-07', '18-33-28-23-19-04'), jackpot_php: undefined },
      { ...row('4D', '2026-11-06', '2-5-0-5'), jackpot_php: 38542 }
    ], error: null }
    const rows = await loadLotto(NOW)
    expect(rows!.map((x) => x.jackpot_php)).toEqual([489846673.65, null, null, null, 38542])
  })
  it('loadNextJackpots reads the rows, drops under P5,000,000 and non-numbers, and a missing table falls back to the saved copy then null', async () => {
    const r = { game: '6/58 Ultra Lotto', draw_date: '2026-11-08', jackpot_php: 486000000 }
    h.next = { data: [r, { game: '6/55 Grand Lotto', draw_date: '2026-11-09', jackpot_php: 1 }, { game: '6/49 Super Lotto', draw_date: '2026-11-10', jackpot_php: '90000000' }], error: null }
    expect(await loadNextJackpots(NOW)).toEqual([r])
    h.next = { data: null, error: { message: 'relation does not exist' } }
    expect(await loadNextJackpots(NOW)).toBeNull()
    h.saved = { value: { savedAt: NOW - 2 * 86_400_000, rows: [r] } }
    expect(await loadNextJackpots(NOW)).toHaveLength(1)
    h.saved = { value: { savedAt: NOW - 8 * 86_400_000, rows: [r] } }
    expect(await loadNextJackpots(NOW)).toBeNull()
  })
  it('nextJackpotFor: only a row for this game, today or later in Manila, and newer than the shown result', () => {
    const n = [{ game: '6/58 Ultra Lotto', draw_date: '2026-11-08', jackpot_php: 486000000 }, { game: '6/58 Ultra Lotto', draw_date: '2026-11-13', jackpot_php: 500000000 }, { game: '6/55 Grand Lotto', draw_date: '2026-11-09', jackpot_php: 40000000 }]
    const last = row('6/58 Ultra Lotto', '2026-11-06')
    expect(nextJackpotFor(n, last, NOW)).toBe(486000000) // soonest
    expect(nextJackpotFor(n, row('6/58 Ultra Lotto', '2026-11-08'), NOW)).toBe(500000000) // the 8th is already drawn
    expect(nextJackpotFor(n, last, Date.parse('2026-11-08T16:30:00Z'))).toBe(500000000) // 00:30 on the 9th in Manila: the 8th is over
    expect(nextJackpotFor(n, row('6/42 Lotto', '2026-11-07'), NOW)).toBeNull()
    expect(nextJackpotFor(null, last, NOW)).toBeNull()
  })
})
