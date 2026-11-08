import { useEffect, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'

/** A lotto_results row (migration 0054). jackpot_php and winners are null when the results page (the lottopcso.com mirror, D-153) shows no readable value. */
export interface LottoRow { game: string; draw_date: string; combination: string; jackpot_php: number | null; winners: number | null }
interface Saved { savedAt: number; rows: LottoRow[] }
const CACHE = 'today.lotto'
export const LOTTO_DAYS = 30 // the server keeps 30 days; so does the saved copy

/** The games the card shows, in order: the posted name must contain the match. 3D is the 9 PM draw only. */
export const GAMES: { key: string; match: RegExp }[] = [
  { key: '6/58', match: /6\/58/ }, { key: '6/55', match: /6\/55/ }, { key: '6/49', match: /6\/49/ }, { key: '6/45', match: /6\/45/ }, { key: '6/42', match: /6\/42/ },
  { key: '3D 9PM', match: /\b3D\b.*9\s*PM/i }
]

/** The newest draw of each shown game, in GAMES order; a game with no row is left out. */
export function latestPerGame(rows: LottoRow[]): LottoRow[] {
  return GAMES.flatMap((g) => {
    const mine = rows.filter((r) => g.match.test(r.game)).sort((a, b) => (a.draw_date < b.draw_date ? 1 : a.draw_date > b.draw_date ? -1 : 0))
    return mine[0] ? [mine[0]] : []
  })
}

const valid = (r: unknown): r is LottoRow => {
  const o = (r ?? {}) as Record<string, unknown>
  return typeof o.game === 'string' && typeof o.draw_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.draw_date) && typeof o.combination === 'string' && /^\d{1,2}(-\d{1,2}){1,5}$/.test(o.combination)
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
    const rows = ((data ?? []) as unknown[]).filter(valid)
    await db.kv.put({ key: CACHE, value: { savedAt: now, rows } satisfies Saved }).catch(() => undefined)
    return rows
  } catch {
    return await saved()
  }
}

/** useLotto(): { rows } with null until the first read settles or when nothing is known; an empty list is a quiet table. */
export function useLotto(): { rows: LottoRow[] | null } {
  const [rows, setRows] = useState<LottoRow[] | null>(null)
  useEffect(() => {
    let live = true
    void loadLotto().then((r) => { if (live) setRows(r) }, () => undefined)
    return () => { live = false }
  }, [])
  return { rows }
}
