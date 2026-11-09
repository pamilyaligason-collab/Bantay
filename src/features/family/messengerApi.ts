import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { cleanMessenger } from './messagesLogic'

/** Messenger names (migration 0061, people.messenger). Own small read so the profile sync stays untouched. Never throws; offline, signed out or 0061 not applied = no names (no button), never an error screen. Names are not logged (B-7). */
type Names = Record<string, string | null>
let cache: { at: number; map: Names } | null = null
let inflight: Promise<Names> | null = null
const subs = new Set<(m: Names) => void>()
const TTL = 60_000

export async function loadMessengers(force = false): Promise<Names> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.map
  if (!supabase) return cache?.map ?? {}
  inflight ??= (async () => {
    try {
      const r = await supabase!.from('people').select('id,messenger')
      if (r.error) return cache?.map ?? {}
      const map: Names = {}
      for (const x of r.data ?? []) map[String(x.id)] = cleanMessenger(x.messenger as string | null)
      cache = { at: Date.now(), map }
      subs.forEach((f) => f(map))
      return map
    } catch { return cache?.map ?? {} } finally { inflight = null }
  })()
  return inflight
}

/** Forget every name (sign-out on a shared phone, tests). */
export function resetMessengers() { cache = null; inflight = null; subs.forEach((f) => f({})) }

export function useMessengers(): Names {
  const [m, setM] = useState<Names>(cache?.map ?? {})
  useEffect(() => {
    let live = true
    const f = (x: Names) => { if (live) setM(x) }
    subs.add(f)
    void loadMessengers().then(f)
    return () => { live = false; subs.delete(f) }
  }, [])
  return m
}

/** Save (or clear, with an empty text) one person's Messenger name. RLS decides who may (the person, a writer carer, an admin); a refusal comes back as 'denied'. */
export async function saveMessenger(personId: string, input: string): Promise<'ok' | 'invalid' | 'denied' | 'failed'> {
  const handle = cleanMessenger(input)
  if (input.trim() && !handle) return 'invalid'
  if (!supabase) return 'failed'
  try {
    const r = await supabase.from('people').update({ messenger: handle }).eq('id', personId).select('id')
    if (r.error) return 'failed'
    if (!r.data?.length) return 'denied' // RLS let nothing through
    const map = { ...(cache?.map ?? {}), [personId]: handle }
    cache = { at: Date.now(), map }
    subs.forEach((f) => f(map))
    return 'ok'
  } catch { return 'failed' }
}
