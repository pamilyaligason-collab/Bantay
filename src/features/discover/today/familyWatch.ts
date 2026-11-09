import { useEffect, useState } from 'react'
import { supabase } from '../../auth/client'
import { WATCH_CH_NAMES } from '../../admin/events'
import type { Counts } from './topStories'

/** family_watch_counts() (migration 0060): taps per channel name across the family, last 30 days. null = nothing known (signed out, offline, not applied yet, or no taps), so the caller falls back to this phone's own counts. */
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

/** Read once when Discover opens. */
export function useFamilyWatch(): Counts | null {
  const [c, setC] = useState<Counts | null>(null)
  useEffect(() => {
    let live = true
    void loadFamilyWatch().then((x) => { if (live) setC(x) })
    return () => { live = false }
  }, [])
  return c
}
