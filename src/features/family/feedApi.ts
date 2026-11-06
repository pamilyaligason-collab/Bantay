import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import { db, type FeedRow } from '../../db'
import { supabase } from '../auth/client'
import { isNotSetUp } from './memoriesLogic'
import type { Res } from './memoriesApi'

/** Family feed data (D-134, migration 0050). Never throws; never logs values or paths (B-7). */
/** Read the list now (the sync run does this after the table pulls). Loaded on use so screens that only read the feed do not pull in the sync engine. */
export const pullFeed = async (): Promise<void> => (await import('../sync/sync')).pullFeed()
export type FeedCategory = 'bp' | 'lab' | 'photo' | 'status'
export const FEED_CATEGORIES: FeedCategory[] = ['bp', 'lab', 'photo', 'status']

/** Switch one category for a person (the server decides who may). Called direct, not queued: offline says so. */
export async function setFeedShare(personId: string, category: FeedCategory, on: boolean): Promise<Res<null>> {
  if (!supabase) return { ok: false, error: 'unavailable' }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, error: 'offline' }
  try {
    const { error } = await supabase.rpc('feed_share_set', { p_person: personId, p_category: category, p_on: on })
    if (!error) return { ok: true, data: null }
    return { ok: false, error: isNotSetUp(error) ? 'not_set_up' : 'failed' }
  } catch { return { ok: false, error: 'failed' } }
}

/** The posts this phone holds, newest first. null until the first read. */
export function useFeed(): FeedRow[] | null {
  const [rows, setRows] = useState<FeedRow[] | null>(null)
  useEffect(() => {
    const sub = liveQuery(() => db.feed.orderBy('at').reverse().toArray()).subscribe({ next: setRows, error: () => setRows([]) })
    return () => sub.unsubscribe()
  }, [])
  return rows
}

/** A person's four switches, read online. `on` is null while unknown (offline, no migration, not allowed): unknown is never off. */
export function useFeedShares(personId: string | null): { on: Record<FeedCategory, boolean> | null; refresh: () => void } {
  const [on, setOn] = useState<Record<FeedCategory, boolean> | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setOn(null)
    if (!supabase || !personId) return
    void (async () => {
      try {
        const r = await supabase!.from('feed_shares').select('category,enabled').eq('person_id', personId)
        if (!live || r.error) return
        const next: Record<FeedCategory, boolean> = { bp: false, lab: false, photo: false, status: false } // no row = off
        for (const x of r.data ?? []) if (FEED_CATEGORIES.includes(x.category as FeedCategory)) next[x.category as FeedCategory] = x.enabled === true
        setOn(next)
      } catch { /* stays unknown */ }
    })()
    return () => { live = false }
  }, [personId, n])
  return { on, refresh: useCallback(() => setN((v) => v + 1), []) }
}

/** Signed links for the photo posts on screen, made on view from the stored path (5 minutes). */
export async function signFeedPhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!supabase || !paths.length) return out
  try {
    const r = await supabase.storage.from('memories').createSignedUrls(paths, 300)
    for (const s of r.data ?? []) if (s.signedUrl && s.path) out.set(s.path, s.signedUrl)
  } catch { /* no links: the post shows its text */ }
  return out
}
