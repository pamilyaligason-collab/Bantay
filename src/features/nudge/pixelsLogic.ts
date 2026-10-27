import type { Reading } from '../health/ranges'
import { dayOf } from '../health/meds'
import { BP_WORDS, bpLevel, type BpLevel } from '../health/verdict'

/** Year in pixels: one small mark per day of the year, from that day's average blood pressure. The WORD comes from verdict.ts (the one BP table);
 *  the mark carries the level in its SHAPE as well as its colour, so it still reads for colour-blind eyes. Pure. Unknown (no reading that day) is a null mark, never "In range". */
export type Shape = 'circle' | 'diamond' | 'square' | 'tri-up' | 'tri-down'
export interface Pixel { level: BpLevel; word: string; shape: Shape; color: string; sys: number; dia: number }
export interface Cell { day: string; px: Pixel | null; future: boolean }

export const SHAPE_OF: Record<BpLevel, Shape> = { in: 'circle', raised: 'diamond', above: 'square', high: 'tri-up', low: 'tri-down' }
export const COLOR_OF: Record<BpLevel, string> = { in: 'var(--ok)', raised: 'var(--c-vitals)', above: 'var(--amber)', high: 'var(--red)', low: 'var(--c1)' }

export function pixelOf(sys: number, dia: number): Pixel | null {
  const level = bpLevel(sys, dia)
  if (!level) return null
  return { level, word: BP_WORDS[level].word, shape: SHAPE_OF[level], color: COLOR_OF[level], sys, dia }
}

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Every day of `year` (Jan 1 to Dec 31), each with the pixel of that day's average top and bottom. Days after `now` are `future`. */
export function yearPixels(i: { readings: Reading[]; personId: string; year: number; now: Date }): Cell[] {
  const top = new Map<string, number[]>()
  const bottom = new Map<string, number[]>()
  for (const r of i.readings) {
    if (r.personId !== i.personId || !num(r.value)) continue
    const m = r.test === 'bp_systolic' ? top : r.test === 'bp_diastolic' ? bottom : null
    const d = dayOf(r.takenAt)
    if (!m || !d) continue
    m.set(d, [...(m.get(d) ?? []), r.value])
  }
  const today = dayOf(i.now)
  const out: Cell[] = []
  for (let d = new Date(i.year, 0, 1, 12); d.getFullYear() === i.year; d.setDate(d.getDate() + 1)) {
    const day = dayOf(d)
    const t = top.get(day)
    const b = bottom.get(day)
    out.push({ day, px: t && b ? pixelOf(mean(t), mean(b)) : null, future: day > today })
  }
  return out
}

/** How many days of the year have a mark, and how many of each level (the legend counts). */
export function tally(cells: Cell[]): { days: number; by: Record<BpLevel, number> } {
  const by: Record<BpLevel, number> = { in: 0, raised: 0, above: 0, high: 0, low: 0 }
  let days = 0
  for (const c of cells) if (c.px) { by[c.px.level]++; days++ }
  return { days, by }
}
