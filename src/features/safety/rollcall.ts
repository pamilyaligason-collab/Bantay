import { db } from '../../db'
import { supabase } from '../auth/client'

/** Storm roll call (0041, D-85): "I'm safe" / "I need help" is one row per person per storm, written by the rollcall_set RPC (the table has no write grant; the server checks the
 *  caller, the live storm and a rate limit). Never the outbox: a check-in that waits in a queue is not a check-in. Offline it is NOT queued; the person is told to try again or call. */
export type RollStatus = 'ok' | 'need_help'
export interface RollRow { personId: string; status: RollStatus; at: string }
export type SendResult = 'sent' | 'offline' | 'refused'

const isNetwork = (e: { code?: string; message?: string }) => !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? '')

export async function sendRollcall(personId: string, ref: string, status: RollStatus): Promise<SendResult> {
  try {
    if (!supabase) return 'refused'
    const { error } = await supabase.rpc('rollcall_set', { p_person: personId, p_storm_ref: ref, p_status: status })
    return !error ? 'sent' : isNetwork(error as { code?: string; message?: string }) ? 'offline' : 'refused'
  } catch {
    return 'offline'
  }
}

/** Everyone's answer for this storm (the family may read them all). null = could not read (offline, signed out): never shown as "nobody answered". */
export async function fetchRollcall(ref: string): Promise<RollRow[] | null> {
  try {
    if (!supabase) return null
    const { data, error } = await supabase.from('rollcall').select('person_id,status,at').eq('storm_ref', ref)
    if (error || !data) return null
    return (data as { person_id: string; status: string; at: string }[])
      .filter((r) => r.status === 'ok' || r.status === 'need_help')
      .map((r) => ({ personId: r.person_id, status: r.status as RollStatus, at: r.at }))
  } catch {
    return null
  }
}

export interface Tally { safe: string[]; help: string[]; none: string[]; line: string }
/** Who is safe, who needs help, who has not answered. `line` is "3 of 5 safe". Rows for people not in the family list are ignored. */
export function tally(peopleIds: string[], rows: RollRow[]): Tally {
  const by = new Map(rows.map((r) => [r.personId, r.status]))
  const safe = peopleIds.filter((id) => by.get(id) === 'ok')
  const help = peopleIds.filter((id) => by.get(id) === 'need_help')
  const none = peopleIds.filter((id) => !by.has(id))
  return { safe, help, none, line: `${safe.length} of ${peopleIds.length} safe` }
}

// ---- the shared Do now checklist: 4 family_tasks rows per storm, made once by the SERVER (rollcall_set / ensure_storm_tasks) ----
export const STORM_TASKS = ['Charge phones and power banks', 'Pack 7 days of medicines in the go-bag', 'Fill water containers', 'Check on a neighbour'] as const // same titles as 0041
/** The server's client_id for item i (0-based): the same on every phone, so the pull and this list agree. */
export const stormTaskId = (ref: string, i: number): string => `storm:${ref}:${i + 1}`

const DONE_KEY = 'storm.tasks' // storm refs this phone already asked the server about (capped, ML-06)
const DONE_MAX = 10
const inflight = new Map<string, Promise<boolean>>()

/** Ask the server to make the storm's 4 tasks (it makes them once for the whole family, never over a task the family ticked or deleted), then pull them.
 *  true = the server has them. A second call on this phone for the same storm does nothing. Offline or refused: false, tried again on the next mount. */
export function ensureStormTasks(ref: string): Promise<boolean> {
  const cur = inflight.get(ref)
  if (cur) return cur
  const p = (async () => {
    try {
      const raw = (await db.kv.get(DONE_KEY))?.value
      const seen = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
      if (seen.includes(ref)) return true
      if (!supabase) return false
      const { error } = await supabase.rpc('ensure_storm_tasks', { p_storm_ref: ref })
      if (error) return false
      await db.kv.put({ key: DONE_KEY, value: [...seen, ref].slice(-DONE_MAX) })
      void import('../sync/sync').then((m) => m.syncNow()).catch(() => {})
      return true
    } catch {
      return false
    } finally {
      inflight.delete(ref)
    }
  })()
  inflight.set(ref, p)
  return p
}
