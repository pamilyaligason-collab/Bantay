import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { db } from '../../db'

/** Mirrors the meds_taken insert RLS (0003_sync.sql): is_self(person) or a carers row with can_write. App admin role does not count. */
export const canMarkFor = (personId: string, ownId: string, writableIds: readonly string[]) =>
  !!personId && (personId === ownId || writableIds.includes(personId))

const KEY = 'carers.writable'
type Client = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Person ids the user is a can_write carer of. A good answer is cached in kv; on error or offline the cached list is used. */
export async function loadWritable(client: Client | null, userId: string): Promise<string[]> {
  const cached = async () => { try { const v = (await db.kv.get(KEY))?.value as { userId?: string; ids?: string[] } | undefined; return v?.userId === userId ? (v.ids ?? []) : [] } catch { return [] } }
  if (!client) return cached()
  try {
    const r = await client.from('carers').select('person_id').eq('carer_id', userId).eq('can_write', true)
    if (r.error) return cached()
    const ids = ((r.data ?? []) as { person_id: string }[]).map((x) => x.person_id)
    await db.kv.put({ key: KEY, value: { userId, ids } }).catch(() => {})
    return ids
  } catch { return cached() }
}

export function useWritableIds(userId: string | undefined): string[] {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    if (!userId) { setIds([]); return }
    let live = true
    const run = () => { void loadWritable(supabase as Client | null, userId).then((v) => { if (live) setIds(v) }) }
    const vis = () => { if (document.visibilityState === 'visible') run() }
    run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', vis)
    return () => { live = false; window.removeEventListener('online', run); document.removeEventListener('visibilitychange', vis) }
  }, [userId])
  return ids
}
