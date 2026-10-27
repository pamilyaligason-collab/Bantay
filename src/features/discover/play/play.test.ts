import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../../db'
import en from '../../../data/play/words-en.json'
import fil from '../../../data/play/words-fil.json'
import trivia from '../../../data/play/trivia.json'
import phFacts from '../../../data/play/ph-facts.json'
import {
  fromLabels, flip, GRID, hintCell, hintPair, lineBetween, makePuzzle, newMemory, notePlayed, pairsFound, pickWords, playedThisWeek, playedToday,
  praise, settle, solved, triviaIndex, triviaReply, wordAt, type Trivia
} from './score'

beforeEach(async () => { await db.kv.clear() })

describe('memory match', () => {
  it('a new board has 6 pairs: 12 cards, 6 labels, each exactly twice', () => {
    const s = newMemory(7)
    expect(s.cards).toHaveLength(12)
    const count = new Map<string, number>()
    for (const c of s.cards) count.set(c.label, (count.get(c.label) ?? 0) + 1)
    expect(count.size).toBe(6)
    expect([...count.values()].every((n) => n === 2)).toBe(true)
    expect(s.cards.every((c) => !c.up && !c.done)).toBe(true)
  })
  it('A B A B: a match is kept, a mismatch turns back, 4 flips solve it (hand computed)', () => {
    let s = fromLabels(['A', 'B', 'A', 'B'])
    s = flip(s, 0); s = flip(s, 1)                         // A then B: no match, both stay up, 2 flips
    expect(s.open).toEqual([0, 1]); expect(s.flips).toBe(2); expect(pairsFound(s)).toBe(0)
    s = flip(s, 0)                                         // a card already up does nothing
    expect(s.flips).toBe(2)
    s = settle(s)
    expect(s.cards.map((c) => c.up)).toEqual([false, false, false, false])
    s = flip(s, 0); s = flip(s, 2)                         // A and A: pair 1
    expect(pairsFound(s)).toBe(1); expect(s.open).toEqual([]); expect(s.flips).toBe(4)
    expect(hintPair(s)).toEqual([1, 3])                    // the only pair left
    s = flip(s, 1); s = flip(s, 3)
    expect(solved(s)).toBe(true); expect(s.flips).toBe(6)
    expect(hintPair(s)).toBeNull()
  })
  it('a third tap while two wrong cards are up turns those two down first', () => {
    let s = fromLabels(['A', 'B', 'A', 'B'])
    s = flip(s, 0); s = flip(s, 1); s = flip(s, 2)
    expect(s.cards.map((c) => c.up)).toEqual([false, false, true, false])
    expect(s.open).toEqual([2])
  })
  it('praise is kind words only: no number, no score, no "wrong", for a fast or a slow game', () => {
    for (const flips of [12, 14, 20, 24, 60, 200]) {
      const p = praise(flips, 'Mama')
      expect(p).not.toMatch(/\d|score|wrong|lose|lost|fail/i)
      expect(p).toContain('Mama')
    }
    expect(praise(12)).toBe('Wow, you have a sharp eye.')
    expect(praise(20)).toBe('Nice! You found them all.')
  })
})

describe('word search', () => {
  const cells = (p: { word: string; r: number; c: number; dr: 0 | 1; dc: 0 | 1 }) => Array.from({ length: p.word.length }, (_v, k) => `${p.r + p.dr * k},${p.c + p.dc * k}`)
  it('the 8x8 grid places the 5 hand-made words without overlap (28 separate squares)', () => {
    const words = ['BAHAY', 'SALAMAT', 'ARAW', 'PAMILYA', 'TUBIG'] // 5 + 7 + 4 + 7 + 5 = 28
    for (const seed of [1, 2, 3, 99, 12345]) {
      const p = makePuzzle(words, seed)
      expect(p.grid).toHaveLength(GRID)
      expect(p.grid.every((row) => row.length === GRID && row.every((ch) => /^[A-Z]$/.test(ch)))).toBe(true)
      expect(p.placed.map((x) => x.word).sort()).toEqual([...words].sort())
      const all = p.placed.flatMap(cells)
      expect(all).toHaveLength(28)
      expect(new Set(all).size).toBe(28) // no shared square
      for (const w of p.placed) cells(w).forEach((k, i) => { const [y, x] = k.split(',').map(Number); expect(p.grid[y!]![x!]).toBe(w.word[i]) })
    }
  })
  it('five 8-letter words (the hardest case) always fit, over 300 seeds', () => {
    const words = ['ABCDEFGH', 'IJKLMNOP', 'QRSTUVWX', 'YZABCDEF', 'GHIJKLMN']
    for (let seed = 0; seed < 300; seed++) {
      const p = makePuzzle(words, seed)
      expect(new Set(p.placed.flatMap(cells)).size).toBe(40)
    }
  })
  it('selection: first and last letter find the word, either way round; a bent or wrong line finds nothing', () => {
    const p = makePuzzle(['BAHAY', 'ARAW'], 5)
    const w = p.placed.find((x) => x.word === 'BAHAY')!
    const end: [number, number] = [w.r + w.dr * 4, w.c + w.dc * 4]
    expect(wordAt(p, [w.r, w.c], end)).toBe('BAHAY')
    expect(wordAt(p, end, [w.r, w.c])).toBe('BAHAY')
    expect(wordAt(p, [w.r, w.c], [w.r + w.dr * 3, w.c + w.dc * 3])).toBeNull() // one short
    expect(wordAt(p, [0, 0], [3, 4])).toBeNull()                                  // diagonal
  })
  it('lineBetween: (2,1) to (2,4) is 4 squares across; (1,3) to (4,3) down; diagonal is null', () => {
    expect(lineBetween([2, 1], [2, 4])).toEqual([[2, 1], [2, 2], [2, 3], [2, 4]])
    expect(lineBetween([1, 3], [4, 3])).toEqual([[1, 3], [2, 3], [3, 3], [4, 3]])
    expect(lineBetween([4, 3], [1, 3])![0]).toEqual([4, 3])
    expect(lineBetween([0, 0], [1, 1])).toBeNull()
  })
  it('hint points at the first letter of a word not found yet', () => {
    const p = makePuzzle(['BAHAY', 'ARAW'], 5)
    const first = p.placed[0]!
    expect(hintCell(p, [])).toEqual([first.r, first.c])
    const second = p.placed[1]!
    expect(hintCell(p, [first.word])).toEqual([second.r, second.c])
    expect(hintCell(p, p.placed.map((x) => x.word))).toBeNull()
  })
  it('each word list is clean: 3 to 8 letters, A to Z, no repeats, and picks give 5 different words', () => {
    for (const list of [en.words, fil.words]) {
      expect(new Set(list).size).toBe(list.length)
      expect(list.every((w) => /^[A-Z]{3,8}$/.test(w))).toBe(true)
      const five = pickWords(list, 42)
      expect(five).toHaveLength(5); expect(new Set(five).size).toBe(5)
      expect(pickWords(list, 42)).toEqual(five) // same seed, same puzzle
    }
  })
})

describe('Alam mo ba? trivia data', () => {
  const qs = trivia.questions as Trivia[]
  it('every question has 4 different answers and one right one, and no em dash anywhere', () => {
    for (const q of qs) {
      expect(q.a).toHaveLength(4); expect(new Set(q.a).size).toBe(4)
      expect(q.right).toBeGreaterThanOrEqual(0); expect(q.right).toBeLessThan(4)
    }
    expect(JSON.stringify([trivia, phFacts, en, fil])).not.toContain('—')
  })
  it('same day, same question; another day usually another; "another question" steps on', () => {
    expect(triviaIndex('2026-10-28', qs.length)).toBe(triviaIndex('2026-10-28', qs.length))
    expect(triviaIndex('2026-10-28', qs.length, 1)).toBe((triviaIndex('2026-10-28', qs.length) + 1) % qs.length)
  })
  it('says Yes for the right answer and Close for any other, never "wrong"', () => {
    const q = qs[0]! // king of fruits in Davao: Durian is index 2
    expect(q.a[q.right]).toBe('Durian')
    expect(triviaReply(q, 2)).toBe('Yes! It is Durian.')
    for (const i of [0, 1, 3]) { expect(triviaReply(q, i)).toBe('Close! It is Durian.'); expect(triviaReply(q, i)).not.toMatch(/wrong/i) }
  })
})

describe('played today (kv play.day, local only)', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0)
  it('counts games for the local day and starts over the next day', async () => {
    expect(await playedToday(at(2026, 10, 28))).toBe(0)
    await notePlayed('Memory match', at(2026, 10, 28))
    await notePlayed('Memory match', at(2026, 10, 28))
    await notePlayed('Alam mo ba?', at(2026, 10, 28))
    expect(await playedToday(at(2026, 10, 28))).toBe(3)
    expect((await db.kv.get('play.day'))!.value).toMatchObject({ day: '2026-10-28', n: 3, games: ['Memory match', 'Alam mo ba?'] })
    expect(await playedToday(at(2026, 10, 29))).toBe(0)
  })
  it('week total: 28 Oct x2, 26 Oct x1 count; 20 Oct is outside the 7 days (22 to 28)', async () => {
    await notePlayed('A', at(2026, 10, 20))
    await notePlayed('A', at(2026, 10, 26))
    await notePlayed('A', at(2026, 10, 28))
    await notePlayed('B', at(2026, 10, 28))
    expect(await playedThisWeek(at(2026, 10, 28))).toBe(3)
  })
  it('keeps only the last 14 days of tallies (ML-06)', async () => {
    for (let d = 1; d <= 20; d++) await notePlayed('A', at(2026, 10, d))
    const v = (await db.kv.get('play.day'))!.value as { days: Record<string, number> }
    expect(Object.keys(v.days)).toHaveLength(14)
    expect(Object.keys(v.days).sort()[0]).toBe('2026-10-07')
  })
})
