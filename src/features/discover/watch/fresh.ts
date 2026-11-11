import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'
import { FRESH_DAYS } from '../learn/ready'

const COLS = 'video_id,shelf,channel,title,published_at'
const rowsOf = (r: { data: unknown; error: unknown }): unknown[] => (r.error || !Array.isArray(r.data) ? [] : r.data)

/** watch_videos rows (migration 0067), newest first: the last 30 days, plus (S34, migration 0068) the evergreen back catalogue of the same channels. Never throws and never shows an error: offline, signed out, a table or column not there yet, a failing job, an empty table all give [] for that part and the shelves stay on the checked list.
 *  The two reads fail alone: without migration 0068 the evergreen read errors and the New videos still show. Not kept on the phone: with no connection the family sees the checked list only. */
export async function loadFresh(now: number = Date.now()): Promise<unknown[]> {
  try {
    if (!supabase) return []
    const sb = supabase
    const since = new Date(now - FRESH_DAYS * 86_400_000).toISOString()
    const part = async (q: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown[]> => { try { return rowsOf(await q()) } catch { return [] } }
    const [recent, evergreen] = await Promise.all([
      part(() => sb.from('watch_videos').select(COLS).gte('published_at', since).order('published_at', { ascending: false }).limit(60)),
      part(() => sb.from('watch_videos').select(COLS).eq('evergreen', true).order('published_at', { ascending: false }).limit(90))
    ])
    return [...recent, ...evergreen]
  } catch {
    return []
  }
}

/** [] until the first read settles, then the rows. */
export function useFreshWatch(): unknown[] {
  const [rows, setRows] = useState<unknown[]>([])
  useEffect(() => {
    let live = true
    void loadFresh().then((r) => { if (live) setRows(r) }, () => undefined)
    return () => { live = false }
  }, [])
  return rows
}
