import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'
import { db } from '../../../db'
import { WATCH_CH_NAMES } from '../../admin/events'
import type { Video } from '../../health/library/videosLogic'
import { manilaDay } from '../../assistant/cap'
import { rankTop, type Counts } from './topStories'

/** family_watch_counts() (migration 0060): taps per channel name across the family, last 30 days. The server only lists a channel that at least 3 different family members tapped (so no member can subtract their own taps to read another viewer).
 *  null = nothing known (signed out, offline, rate limited, not applied yet, or no channel with 3 viewers), so the caller falls back to this phone's own counts. */
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

/** The day's Top stories, kept in kv so the order is fixed for the Manila day: `ok` = the family counts were read, `tries` = how many reads were made today. */
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
 * Top stories for the day. The open never waits for the network: it paints the stored order for the day, or (first open of the day) the day's turn of the pool.
 * The family counts are read in the background (one call, at most WAIT_MS) and the ranked order is STORED for the next open, so nothing moves after first paint.
 * If that read failed, ONE more read is tried on a later open the same day; a success replaces the stored order for the open after it.
 */
export async function topForDay(pool: Video[], now: Date, k: number, local: () => Counts, io: TopIo = realIo): Promise<Video[]> {
  const day = manilaDay(now)
  const byId = new Map(pool.map((v) => [v.id, v]))
  const fetchAndStore = (tries: number, painted: Video[]) =>
    void io.family().then((fam) => io.write({ day, ids: (fam ? rankTop(pool, now, k, fam, local()) : painted).map((v) => v.id), ok: fam !== null, tries }))
  const rec = await io.read()
  if (rec && rec.day === day) {
    const kept = rec.ids.map((i) => byId.get(i)).filter((v): v is Video => !!v)
    if (kept.length) {
      if (!rec.ok && rec.tries < 2) fetchAndStore(rec.tries + 1, kept)
      return kept
    }
  }
  const painted = rankTop(pool, now, k, null, local())
  fetchAndStore(1, painted)
  return painted
}

/** null only while the stored order is read from this phone (a moment); the list is never hidden to wait for the network. */
export function useTopStories(pool: () => Video[], now: Date, k: number, local: () => Counts): Video[] | null {
  const [r, setR] = useState<Video[] | null>(null)
  const day = manilaDay(now)
  useEffect(() => {
    let live = true
    void topForDay(pool(), now, k, local).then((x) => { if (live) setR(x) })
    return () => { live = false }
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps -- once per day: the same day gives the same order
  return r
}
