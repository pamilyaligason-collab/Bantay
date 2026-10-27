import { db } from '../../../db'

/** Local calendar day, `YYYY-MM-DD` (the phone's day, so a game at 11 PM counts for that night). */
export const dayKey = (d: Date = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Small seeded random numbers (mulberry32), so a puzzle or a day's pick can be repeated in a test. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const seedOf = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
export function shuffle<T>(a: readonly T[], r: () => number): T[] {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j]!, o[i]!] }
  return o
}

// ---- played today: a local count only, no server (kv `play.day`) ----
export interface PlayDay { day: string; n: number; games: string[]; days: Record<string, number> }
const KEEP_DAYS = 14 // ML-06: the per-day tally is trimmed to two weeks

const readDay = async (): Promise<PlayDay | null> => ((await db.kv.get('play.day'))?.value as PlayDay | undefined) ?? null
/** Games played today (0 when none). Reads the local count only. */
export async function playedToday(now: Date = new Date()): Promise<number> {
  const v = await readDay().catch(() => null)
  return v && v.day === dayKey(now) ? v.n : 0
}
/** Names of the games played today, for the "Played today" line. */
export async function gamesToday(now: Date = new Date()): Promise<string[]> {
  const v = await readDay().catch(() => null)
  return v && v.day === dayKey(now) ? v.games : []
}
/** Games played in the 7 days up to and including `now` (for the weekly family line). */
export async function playedThisWeek(now: Date = new Date()): Promise<number> {
  const v = await readDay().catch(() => null)
  if (!v) return 0
  let n = 0
  for (let i = 0; i < 7; i++) n += v.days[dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))] ?? 0
  return n
}
/** One finished game. Counts once per call; the game's name is listed once a day. */
export async function notePlayed(game: string, now: Date = new Date()): Promise<void> {
  const day = dayKey(now)
  const old = await readDay().catch(() => null)
  const same = old && old.day === day
  const days = { ...(old?.days ?? {}) }
  days[day] = (days[day] ?? 0) + 1
  const keep = Object.keys(days).sort().slice(-KEEP_DAYS)
  const games = same ? old.games : []
  const next: PlayDay = { day, n: same ? old.n + 1 : 1, games: games.includes(game) ? games : [...games, game], days: Object.fromEntries(keep.map((k) => [k, days[k]!])) }
  await db.kv.put({ key: 'play.day', value: next }).catch(() => undefined)
}

// ---- memory match ----
export const PAIR_LABELS = ['Mango', 'Saging', 'Niyog', 'Suha', 'Papaya', 'Pinya', 'Santol', 'Atis', 'Kalamansi', 'Ubas']
export interface MemCard { label: string; up: boolean; done: boolean }
export interface MemState { cards: MemCard[]; open: number[]; flips: number }
export const PAIRS = 6

/** A new board: 6 pairs, shuffled. */
export function newMemory(seed: number): MemState {
  const r = rng(seed)
  const labels = shuffle(PAIR_LABELS, r).slice(0, PAIRS)
  return fromLabels(shuffle([...labels, ...labels], r))
}
export const fromLabels = (labels: string[]): MemState => ({ cards: labels.map((label) => ({ label, up: false, done: false })), open: [], flips: 0 })
export const pairsFound = (s: MemState): number => s.cards.filter((c) => c.done).length / 2
export const solved = (s: MemState): boolean => s.cards.every((c) => c.done)

/** Turn a card over. A third tap while two wrong cards are still up turns those two down first. Taps on a card already up or done do nothing. */
export function flip(s: MemState, i: number): MemState {
  const c = s.cards[i]
  if (!c || c.done || c.up) return s
  const base = s.open.length === 2 ? settle(s) : s
  const cards = base.cards.map((x, k) => (k === i ? { ...x, up: true } : x))
  const open = [...base.open, i]
  if (open.length === 2 && cards[open[0]!]!.label === cards[open[1]!]!.label) {
    return { cards: cards.map((x, k) => (open.includes(k) ? { ...x, done: true } : x)), open: [], flips: base.flips + 1 }
  }
  return { cards, open, flips: base.flips + 1 }
}
/** Turn the two mismatched cards face down again (the screen calls this after a short pause). */
export const settle = (s: MemState): MemState => (s.open.length < 2 ? s : { ...s, cards: s.cards.map((x, k) => (s.open.includes(k) ? { ...x, up: false } : x)), open: [] })
/** The two positions of one pair that is not found yet (first in board order), or null when all are found. */
export function hintPair(s: MemState): [number, number] | null {
  for (let i = 0; i < s.cards.length; i++) {
    const c = s.cards[i]!
    if (c.done) continue
    const j = s.cards.findIndex((x, k) => k > i && !x.done && x.label === c.label)
    if (j > 0) return [i, j]
  }
  return null
}
/** Kind words at the end. Never a score and never a number: a slow game gets the same warmth as a fast one. */
export function praise(flips: number, name?: string): string {
  const who = name ? `, ${name}` : ''
  if (flips <= PAIRS * 2 + 2) return `Wow${who}, you have a sharp eye.`
  if (flips <= PAIRS * 4) return `Nice${who}! You found them all.`
  return `Well done${who}. Every pair is found, and that is what counts.`
}

// ---- word search ----
export const GRID = 8
export const WORDS_PER_PUZZLE = 5
export interface Placed { word: string; r: number; c: number; dr: 0 | 1; dc: 0 | 1 }
export interface Puzzle { grid: string[][]; placed: Placed[] }
type Cell = [number, number]

/** Pick 5 words (3 to 8 letters, no repeats) for a seed. */
export function pickWords(list: readonly string[], seed: number): string[] {
  return shuffle(list.filter((w) => w.length >= 3 && w.length <= GRID), rng(seed)).slice(0, WORDS_PER_PUZZLE)
}
const cellsOf = (p: Placed): Cell[] => Array.from({ length: p.word.length }, (_v, k) => [p.r + p.dr * k, p.c + p.dc * k])

/** Place each word across or down on an 8 by 8 board; no two words share a square. Long words go first. Every word fits, because after random tries it scans the whole board. */
export function makePuzzle(words: readonly string[], seed: number): Puzzle {
  const r = rng(seed)
  const grid: string[][] = Array.from({ length: GRID }, () => Array<string>(GRID).fill(''))
  const placed: Placed[] = []
  const fits = (p: Placed) => p.r + p.dr * (p.word.length - 1) < GRID && p.c + p.dc * (p.word.length - 1) < GRID && cellsOf(p).every(([y, x]) => !grid[y!]![x!])
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    const dirs: [0 | 1, 0 | 1][] = [[0, 1], [1, 0]]
    let spot: Placed | null = null
    for (let t = 0; t < 40 && !spot; t++) {
      const [dr, dc] = dirs[Math.floor(r() * 2)]!
      const p: Placed = { word, r: Math.floor(r() * GRID), c: Math.floor(r() * GRID), dr, dc }
      if (fits(p)) spot = p
    }
    for (let y = 0; y < GRID && !spot; y++) for (let x = 0; x < GRID && !spot; x++) for (const [dr, dc] of dirs) { const p: Placed = { word, r: y, c: x, dr, dc }; if (!spot && fits(p)) spot = p }
    if (!spot) throw new Error('word does not fit: ' + word) // cannot happen for 5 words of 8 letters or fewer
    for (const [y, x] of cellsOf(spot)) grid[y!]![x!] = word[(y! - spot.r) + (x! - spot.c)]!
    placed.push(spot)
  }
  const letters = 'AEIOUAEIOUBDGHKLMNPRSTWY'
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (!grid[y]![x]) grid[y]![x] = letters[Math.floor(r() * letters.length)]!
  return { grid, placed }
}
/** The straight line of squares from a to b (across or down only, either way), or null. */
export function lineBetween(a: Cell, b: Cell): Cell[] | null {
  if (a[0] !== b[0] && a[1] !== b[1]) return null
  const n = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + 1
  const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1])
  return Array.from({ length: n }, (_v, k) => [a[0] + dr * k, a[1] + dc * k])
}
/** The word whose squares are exactly the line from a to b (either direction), or null. */
export function wordAt(p: Puzzle, a: Cell, b: Cell): string | null {
  const line = lineBetween(a, b)
  if (!line) return null
  const key = (cs: Cell[]) => cs.map((c) => c.join(',')).sort().join(';')
  const want = key(line)
  return p.placed.find((w) => key(cellsOf(w)) === want)?.word ?? null
}
/** First square of a word not found yet, for the hint (null when all are found). */
export function hintCell(p: Puzzle, found: readonly string[]): Cell | null {
  const w = p.placed.find((x) => !found.includes(x.word))
  return w ? [w.r, w.c] : null
}

// ---- Alam mo ba? daily question ----
export interface Trivia { q: string; a: string[]; right: number; why: string }
/** Question number for a day: the same one all day, a new one tomorrow. `skip` steps on for "another question". */
export const triviaIndex = (day: string, count: number, skip = 0): number => (seedOf(day) + skip) % count
/** What to say after an answer. Always kind: a different pick is "Close!", never "wrong". */
export const triviaReply = (t: Trivia, pick: number): string => (pick === t.right ? `Yes! It is ${t.a[t.right]}.` : `Close! It is ${t.a[t.right]}.`)
