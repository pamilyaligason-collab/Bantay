// lotto-pcso core: the lottopcso.com home page (unofficial mirror; PCSO's own site answers 403 to servers, D-153) -> lotto_results rows (Today "Lotto results" card).
// A row is kept only with a readable date, a known game, numbers that fit the game and a real draw day; anything else is skipped, never repaired.
export const SOURCE_URL = 'https://www.lottopcso.com/'
export const KEEP_DAYS = 30
export const FRESH_DAYS = 14 // a draw older than this on the page is not this week's result
export interface LottoRow { game: string; draw_date: string; combination: string; jackpot_php: number | null; winners: number | null }

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const text = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1)) || 32) : NAMED[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim()
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "November 8, 2026" (or yyyy-mm-dd) to yyyy-mm-dd; null when it is not a real calendar day. */
export function isoDate(s: string): string | null {
  const en = /^([A-Za-z]+) (\d{1,2}),? (\d{4})$/.exec(s)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const mo = en ? MONTHS.indexOf(en[1]!.toLowerCase()) + 1 : iso ? Number(iso[2]) : 0
  const [y, d] = en ? [Number(en[3]), Number(en[2])] : iso ? [Number(iso[1]), Number(iso[3])] : [0, 0]
  if (!y || !mo) return null
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
}
const num = (s: string | undefined): number | null => { const v = (s ?? '').replace(/^\D{0,3}/, '').replace(/,/g, ''); return /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : null } // unknown ("*", "Stand by") stays null, never 0

// Draw days (0 = Sunday) of the six-number games, and the highest ball.
const SIX: Record<string, { days: number[]; max: number }> = {
  '6/58': { days: [2, 5, 0], max: 58 }, '6/55': { days: [1, 3, 6], max: 55 }, '6/49': { days: [2, 4, 0], max: 49 }, '6/45': { days: [1, 3, 5], max: 45 }, '6/42': { days: [2, 4, 6], max: 42 }
}
const DIGITS: Record<string, RegExp> = { '4D': /^\d(-\d){3}$/, '6D': /^\d(-\d){5}$/, '3D': /^\d(-\d){2}$/, '2D': /^\d{2}-\d{2}$/ }
const TIMES: Record<string, string> = { '2:00 PM': '2PM', '5:00 PM': '5PM', '9:00 PM': '9PM' }
const sixOk = (key: string, n: string) => {
  if (!/^\d{2}(-\d{2}){5}$/.test(n)) return false
  const a = n.split('-').map(Number)
  return new Set(a).size === 6 && a.every((x) => x >= 1 && x <= SIX[key]!.max)
}
const digitsOk = (key: string, n: string) => DIGITS[key]!.test(n) && (key !== '2D' || n.split('-').every((x) => Number(x) >= 1 && Number(x) <= 31))
const cellAfter = (c: string[], label: RegExp, from: number): string | undefined => { const i = c.findIndex((x, k) => k >= from && label.test(x)); return i < 0 ? undefined : c[i + 1] }

/** Null when the page has no game table at all (the page changed or failed); an empty list means tables were there but nothing passed. Bad rows are skipped. `now` is epoch ms. */
export function parseResults(html: unknown, now: number): LottoRow[] | null {
  if (typeof html !== 'string') return null
  const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10) // Manila date
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - FRESH_DAYS * 86_400_000).toISOString().slice(0, 10)
  const out = new Map<string, LottoRow>()
  const clash = new Set<string>()
  let tables = 0
  const add = (r: LottoRow) => {
    const k = `${r.game}|${r.draw_date}`
    if (out.get(k) && out.get(k)!.combination !== r.combination) clash.add(k) // the same draw with two different numbers: trust neither
    else out.set(k, r)
  }
  for (const t of html.matchAll(/<table[\s>][\s\S]*?<\/table>/gi)) {
    const c = Array.from(t[0].matchAll(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi), (x) => text(x[0]))
    const head = /^(6\/58|6\/55|6\/49|6\/45|6\/42|6D|4D|3D|2D)\s/.exec(c[0] ?? '')
    if (!head || c.length < 4) continue // STL, prize charts, side tables
    tables++
    const key = head[1]!
    const draw_date = isoDate(c[1]!)
    if (!draw_date || draw_date > today || draw_date < oldest) continue
    if (SIX[key]) {
      const i = c.findIndex((x, k) => k >= 2 && /^winning combination$/i.test(x))
      const combination = i < 0 ? '' : c[i + 1]!
      if (!sixOk(key, combination) || !SIX[key].days.includes(new Date(`${draw_date}T00:00:00Z`).getUTCDay())) continue
      const w = cellAfter(c, /^jackpot winner/i, i + 2)
      add({ game: c[0]!, draw_date, combination, jackpot_php: num(cellAfter(c, /^jackpot prize$/i, i + 2)), winners: w && /^\d{1,7}$/.test(w) ? Number(w) : null })
    } else if (key === '4D' || key === '6D') {
      const combination = c[3] ?? ''
      if (TIMES[c[2]!] !== '9PM' || !digitsOk(key, combination)) continue
      const w = cellAfter(c, /^number of winner/i, 4)
      add({ game: key, draw_date, combination, jackpot_php: num(cellAfter(c, /^first prize$/i, 4)), winners: w && /^\d{1,7}$/.test(w) ? Number(w) : null })
    } else {
      for (let i = 2; i + 1 < c.length; i += 2) {
        const time = TIMES[c[i]!]
        if (time && digitsOk(key, c[i + 1]!)) add({ game: `${key} ${time}`, draw_date, combination: c[i + 1]!, jackpot_php: null, winners: null })
      }
    }
  }
  if (!tables) return null
  return [...out].filter(([k]) => !clash.has(k)).map(([, r]) => r)
}

export interface Port {
  upsert(rows: (LottoRow & { fetched_at: string })[]): Promise<void>
  /** Deletes rows whose draw_date is before this yyyy-mm-dd. */
  purge(beforeDate: string): Promise<void>
}
export type Result = { ok: boolean; rows: number }

export async function runLotto(port: Port, fetchText: (url: string) => Promise<string>, now: number): Promise<Result> {
  const rows = parseResults(await fetchText(SOURCE_URL), now)
  if (!rows?.length) return { ok: false, rows: 0 } // no valid draw on the page: a layout change or a block page, not "no draws"
  const cutoff = new Date(now - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)
  const keep = rows.filter((r) => r.draw_date >= cutoff)
  if (keep.length) await port.upsert(keep.map((r) => ({ ...r, fetched_at: new Date(now).toISOString() })))
  await port.purge(cutoff) // only after a readable page, so a failed fetch never empties the table early
  return { ok: true, rows: keep.length }
}
