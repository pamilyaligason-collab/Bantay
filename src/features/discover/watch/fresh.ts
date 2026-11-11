import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'
import { FRESH_DAYS } from '../learn/ready'

/** watch_videos rows (migration 0067), newest first. Never throws and never shows an error: offline, signed out, the table not there yet, a failing job, an empty table all give [] and the shelves stay on the checked list. Not kept on the phone: with no connection the family sees the checked list only. */
export async function loadFresh(now: number = Date.now()): Promise<unknown[]> {
  try {
    if (!supabase) return []
    const since = new Date(now - FRESH_DAYS * 86_400_000).toISOString()
    const { data, error } = await supabase.from('watch_videos').select('video_id,shelf,channel,title,published_at').gte('published_at', since).order('published_at', { ascending: false }).limit(60)
    return error || !Array.isArray(data) ? [] : data
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
