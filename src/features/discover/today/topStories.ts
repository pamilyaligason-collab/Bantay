import type { Video } from '../../health/library/videosLogic'
import { dayKey } from '../play/score'
import { watchName } from '../channels'

export type Counts = Record<string, number>

/** k items from the list starting at today's turn (wrapping): the same day always gives the same picks, and the shelf changes day by day. The day number comes from dayKey (Date.parse of YYYY-MM-DD is UTC midnight). */
export function turn<T>(list: T[], now: Date, k: number): T[] {
  if (!list.length) return []
  const start = Math.floor(Date.parse(dayKey(now)) / 864e5) % list.length
  return Array.from({ length: Math.min(k, list.length) }, (_, i) => list[(start + i) % list.length]!)
}

const pos = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

/**
 * Top stories order (D-180). The signal, strongest first:
 *  1. family: taps per channel across the family (watch_ch_<key> -> n), when any channel has one;
 *  2. this phone: taps per video (dc.watchcounts), summed per channel;
 *  3. none: today's turn of the pool (a new pick each day).
 * With a signal the channels are ordered by taps (ties keep today's turn order) and the cards alternate between them, one per channel per round,
 * so the most-watched channel leads without filling the list. Nothing random: the same day and the same counts give the same order.
 */
export function rankTop(pool: Video[], now: Date, k: number, family: Counts | null, local: Counts): Video[] {
  const day = turn(pool, now, pool.length)
  const famW = (s: string) => pos(family?.[watchName(s) ?? ''])
  let weight = famW
  if (!day.some((v) => famW(v.source) > 0)) {
    const byChannel = new Map<string, number>()
    for (const v of pool) byChannel.set(v.source, (byChannel.get(v.source) ?? 0) + pos(local[v.id]))
    if (![...byChannel.values()].some((n) => n > 0)) return day.slice(0, k)
    weight = (s) => byChannel.get(s) ?? 0
  }
  const groups = new Map<string, Video[]>()
  for (const v of day) groups.set(v.source, [...(groups.get(v.source) ?? []), v])
  const ordered = [...groups.entries()].sort((a, b) => weight(b[0]) - weight(a[0])).map((e) => e[1]) // sort is stable: ties stay in today's order
  const out: Video[] = []
  for (let r = 0; out.length < Math.min(k, day.length); r++) for (const g of ordered) if (g[r]) out.push(g[r]!)
  return out.slice(0, k)
}
