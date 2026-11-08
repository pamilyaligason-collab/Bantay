// lotto-pcso core: the PCSO results table (https://www.pcso.gov.ph/SearchLottoResult.aspx) -> lotto_results rows (Today "Lotto results" card).
// GET table only: if PCSO later needs a form post for the latest draws, the page returns what it shows by default and nothing else is attempted.
export const SOURCE_URL = 'https://www.pcso.gov.ph/SearchLottoResult.aspx'
export const KEEP_DAYS = 30
export interface LottoRow { game: string; draw_date: string; combination: string; jackpot_php: number | null; winners: number | null }

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const text = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1)) || 32) : NAMED[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim()
const COMBO = /^[0-9]{1,2}(-[0-9]{1,2}){1,5}$/

/** m/d/yyyy or yyyy-mm-dd to yyyy-mm-dd; null when it is not a real calendar day. */
export function isoDate(s: string): string | null {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const [y, mo, d] = us ? [Number(us[3]), Number(us[1]), Number(us[2])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0]
  if (!y) return null
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
}
const num = (s: string): number | null => { const v = s.replace(/,/g, ''); return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null } // unknown stays null, never 0

/** Null when the text has no results table with the headings (the page changed or failed); an empty list is a valid quiet answer. Bad rows are dropped. */
export function parseResults(html: unknown): LottoRow[] | null {
  if (typeof html !== 'string' || !/LOTTO GAME/i.test(html) || !/COMBINATIONS/i.test(html)) return null
  const out = new Map<string, LottoRow>()
  for (const tr of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = Array.from(tr[0].matchAll(/<td[\s>][\s\S]*?<\/td>/gi), (c) => text(c[0]))
    if (cells.length < 5) continue
    const [game, combination, date, jackpot, winners] = cells as [string, string, string, string, string]
    const draw_date = isoDate(date)
    const combo = combination.replace(/\s+/g, '')
    if (!game || game.length > 60 || !draw_date || !COMBO.test(combo)) continue
    out.set(`${game}|${draw_date}`, { game, draw_date, combination: combo, jackpot_php: num(jackpot), winners: /^\d+$/.test(winners) ? Number(winners) : null })
  }
  return [...out.values()]
}

export interface Port {
  upsert(rows: (LottoRow & { fetched_at: string })[]): Promise<void>
  /** Deletes rows whose draw_date is before this yyyy-mm-dd. */
  purge(beforeDate: string): Promise<void>
}
export type Result = { ok: boolean; rows: number }

export async function runLotto(port: Port, fetchText: (url: string) => Promise<string>, now: number): Promise<Result> {
  const rows = parseResults(await fetchText(SOURCE_URL))
  if (rows === null) return { ok: false, rows: 0 }
  const cutoff = new Date(now - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)
  const keep = rows.filter((r) => r.draw_date >= cutoff)
  if (keep.length) await port.upsert(keep.map((r) => ({ ...r, fetched_at: new Date(now).toISOString() })))
  await port.purge(cutoff) // only after a readable page, so a failed fetch never empties the table early
  return { ok: true, rows: keep.length }
}
