import { useEffect, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'

/** A lotto_results row (migration 0054). jackpot_php and winners are null when the results page (the lottopcso.com mirror, D-153) shows no readable value. */
export interface LottoRow { game: string; draw_date: string; combination: string; jackpot_php: number | null; winners: number | null }
/** A lotto_next_jackpot row (migration 0058): the jackpot of a draw whose numbers are not out yet. */
export interface NextJackpot { game: string; draw_date: string; jackpot_php: number }
export const JACKPOT_MIN = 5_000_000 // below this the source shows a placeholder (same floor as the lotto-pcso function and 0058)
interface Saved { savedAt: number; rows: LottoRow[] }
const CACHE = 'today.lotto'
const NEXT_CACHE = 'today.lotto.next'
export const LOTTO_DAYS = 30 // the server keeps 30 days; so does the saved copy

/** The games the card shows, in order: the posted name must contain the match. 3D matches any draw time: the newest posted one shows (its time is in the name), so the card keeps a 3D row until the 9 PM draw posts. */
export const GAMES: { key: string; match: RegExp }[] = [
  { key: '6/58', match: /6\/58/ }, { key: '6/55', match: /6\/55/ }, { key: '6/49', match: /6\/49/ }, { key: '6/45', match: /6\/45/ }, { key: '6/42', match: /6\/42/ },
  { key: '3D', match: /\b3D\b/i }
]

/** Hour (0-23) in a game name such as "3D 9PM"; 0 when none, so a same-day tie keeps the later draw. */
const drawHour = (game: string): number => {
  const m = /(\d{1,2})\s*(AM|PM)/i.exec(game)
  return m ? (Number(m[1]) % 12) + (m[2].toUpperCase() === 'PM' ? 12 : 0) : 0
}

/** The newest draw of each shown game, in GAMES order; a game with no row is left out. */
export function latestPerGame(rows: LottoRow[]): LottoRow[] {
  return GAMES.flatMap((g) => {
    const mine = rows.filter((r) => g.match.test(r.game)).sort((a, b) => (a.draw_date < b.draw_date ? 1 : a.draw_date > b.draw_date ? -1 : drawHour(b.game) - drawHour(a.game)))
    return mine[0] ? [mine[0]] : []
  })
}

const valid = (r: unknown): r is LottoRow => {
  const o = (r ?? {}) as Record<string, unknown>
  return typeof o.game === 'string' && typeof o.draw_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.draw_date) && typeof o.combination === 'string' && /^\d{1,2}(-\d{1,2}){1,5}$/.test(o.combination)
}

/** Six-number games only: a jackpot under JACKPOT_MIN, or not a number, is missing (null), never shown as a prize. 3D/4D rows are left alone. */
const clean = (r: LottoRow): LottoRow => {
  if (!/6\/\d\d/.test(r.game)) return r
  const j = r.jackpot_php
  return { ...r, jackpot_php: typeof j === 'number' && Number.isFinite(j) && j >= JACKPOT_MIN ? j : null }
}

/** Reads the latest rows from lotto_results (signed-in read), saves them, and falls back to the saved copy while it is under 30 days old. null = nothing known yet. */
export async function loadLotto(now: number = Date.now()): Promise<LottoRow[] | null> {
  const saved = async () => {
    const s = (await db.kv.get(CACHE).catch(() => undefined))?.value as Saved | undefined
    return s && now - s.savedAt <= LOTTO_DAYS * 86_400_000 ? s.rows : null
  }
  try {
    if (!supabase) throw new Error('not_connected')
    const { data, error } = await supabase.from('lotto_results').select('game,draw_date,combination,jackpot_php,winners').order('draw_date', { ascending: false }).limit(60)
    if (error) throw new Error('read')
    const rows = ((data ?? []) as unknown[]).filter(valid).map(clean)
    await db.kv.put({ key: CACHE, value: { savedAt: now, rows } satisfies Saved }).catch(() => undefined)
    return rows
  } catch {
    return await saved()
  }
}

const validNext = (r: unknown): r is NextJackpot => {
  const o = (r ?? {}) as Record<string, unknown>
  return typeof o.game === 'string' && typeof o.draw_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.draw_date) && typeof o.jackpot_php === 'number' && o.jackpot_php >= JACKPOT_MIN
}

/** Reads the upcoming-draw jackpots (0058), saves them, and falls back to the saved copy (kept 7 days: an old one is useless). null = nothing known; a missing table reads as null, not an error. */
export async function loadNextJackpots(now: number = Date.now()): Promise<NextJackpot[] | null> {
  const saved = async () => {
    const s = (await db.kv.get(NEXT_CACHE).catch(() => undefined))?.value as { savedAt: number; rows: NextJackpot[] } | undefined
    return s && now - s.savedAt <= 7 * 86_400_000 ? s.rows : null
  }
  try {
    if (!supabase) throw new Error('not_connected')
    const { data, error } = await supabase.from('lotto_next_jackpot').select('game,draw_date,jackpot_php').order('draw_date', { ascending: false }).limit(20)
    if (error) throw new Error('read')
    const rows = ((data ?? []) as unknown[]).filter(validNext)
    await db.kv.put({ key: NEXT_CACHE, value: { savedAt: now, rows } }).catch(() => undefined)
    return rows
  } catch {
    return await saved()
  }
}

/** The jackpot of the next draw of the game of `latest`, or null: the row must be today or later (Manila) and newer than the shown result, so a drawn game never shows its old "next" jackpot. */
export function nextJackpotFor(next: NextJackpot[] | null, latest: LottoRow, now: number = Date.now()): number | null {
  const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10)
  const mine = (next ?? []).filter((n) => n.game === latest.game && n.draw_date >= today && n.draw_date > latest.draw_date).sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1))
  return mine[0]?.jackpot_php ?? null
}

/** useLotto(): { rows, next } with null until the first read settles or when nothing is known; an empty list is a quiet table. */
export function useLotto(): { rows: LottoRow[] | null; next: NextJackpot[] | null } {
  const [rows, setRows] = useState<LottoRow[] | null>(null)
  const [next, setNext] = useState<NextJackpot[] | null>(null)
  useEffect(() => {
    let live = true
    void loadLotto().then((r) => { if (live) setRows(r) }, () => undefined)
    void loadNextJackpots().then((r) => { if (live) setNext(r) }, () => undefined)
    return () => { live = false }
  }, [])
  return { rows, next }
}
