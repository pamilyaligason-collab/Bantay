import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'
import { db } from '../../../db'
import { WATCH_CH_NAMES } from '../../admin/events'
import type { Video } from '../../health/library/videosLogic'
import { dayKey } from '../play/score'
import { rankTop, type Counts } from './topStories'

/** family_watch_counts() (migration 0060): taps per channel name across the family, last 30 days. The server only lists a channel that at least 2 different family members tapped (so one person's viewing cannot be read off the totals).
 *  null = nothing known (signed out, offline, rate limited, not applied yet, or no channel with 2 viewers), so the caller falls back to this phone's own counts. */
export async function loadFamilyWatch(): Promise<Counts | null> {
  try {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('family_watch_counts')
    if (error || !Array.isArray(data)) return null
    const out: Counts = {}
    for (const r of data as { name?: unknown; n?: unknown }[]) {
      const n = Number(r?.n)
      if (typeof r?.name === 'string' && (WATCH_CH_NAMES as readonly string[]).includes(r.name) && Number.isFinite(n) && n > 0) out[r.name] = n
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

/** The day's Top stories, kept in kv so the order is fixed for the (device) day: `ok` = the family counts were read, `tries` = how many reads were made today. */
export interface TopRec { day: string; ids: string[]; ok: boolean; tries: number }
const KEY = 'dc.topstories'
const WAIT_MS = 4000 // the first paint never waits longer than this for the family counts

const readRec = async (): Promise<TopRec | null> => {
  try {
    const v = (await db.kv.get(KEY))?.value as Partial<TopRec> | undefined
    return v && typeof v.day === 'string' && Array.isArray(v.ids) ? { day: v.day, ids: v.ids.filter((x) => typeof x === 'string'), ok: v.ok === true, tries: Number(v.tries) || 0 } : null
  } catch { return null }
}
const writeRec = async (r: TopRec) => { try { await db.kv.put({ key: KEY, value: r }) } catch { /* private mode: the ranking is then computed on each open */ } }
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))])

export interface TopIo { read: () => Promise<TopRec | null>; write: (r: TopRec) => Promise<void>; family: () => Promise<Counts | null> }
const realIo: TopIo = { read: readRec, write: writeRec, family: () => withTimeout(loadFamilyWatch(), WAIT_MS) }

/**
 * Top stories for the day, computed once. The first open of the day reads the family counts (one call, at most WAIT_MS), ranks, and stores the order with the day.
 * Every later open that day paints that stored order, so the list never reorders after first paint. If the first read failed, ONE more read is tried later that day
 * in the background; a success replaces the stored order for the next open (this open keeps what it painted).
 */
export async function topForDay(pool: Video[], now: Date, k: number, local: () => Counts, io: TopIo = realIo): Promise<Video[]> {
  const day = dayKey(now)
  const byId = new Map(pool.map((v) => [v.id, v]))
  const store = (fam: Counts | null, tries: number): Video[] => {
    const ranked = rankTop(pool, now, k, fam, local())
    void io.write({ day, ids: ranked.map((v) => v.id), ok: fam !== null, tries })
    return ranked
  }
  const rec = await io.read()
  if (rec && rec.day === day) {
    const kept = rec.ids.map((i) => byId.get(i)).filter((v): v is Video => !!v)
    if (kept.length) {
      if (!rec.ok && rec.tries < 2) void io.family().then((fam) => { if (fam) store(fam, rec.tries + 1); else void io.write({ ...rec, tries: rec.tries + 1 }) })
      return kept
    }
  }
  return store(await io.family(), 1)
}

/** null while the day's order is being read (the screen shows a status line, never a list that then moves). */
export function useTopStories(pool: () => Video[], now: Date, k: number, local: () => Counts): Video[] | null {
  const [r, setR] = useState<Video[] | null>(null)
  const day = dayKey(now)
  useEffect(() => {
    let live = true
    void topForDay(pool(), now, k, local).then((x) => { if (live) setR(x) })
    return () => { live = false }
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps -- once per day: the same day gives the same order
  return r
}
