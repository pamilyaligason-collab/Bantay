import { db } from '../../db'
import { supabase } from '../auth/client'
import { saveRow, fdb, type FamilyTask } from '../family/store'

/** Storm roll call (0041, D-85): "I'm safe" / "I need help" is one row per person per storm, written by a direct REST upsert (never the outbox: a check-in
 *  that waits in a queue is not a check-in). Offline it is NOT queued; the person is told to try again or call. */
export type RollStatus = 'ok' | 'need_help'
export interface RollRow { personId: string; status: RollStatus; at: string }
export type SendResult = 'sent' | 'offline' | 'refused'

const isNetwork = (e: { code?: string; message?: string }) => !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? '')

export async function sendRollcall(personId: string, ref: string, status: RollStatus): Promise<SendResult> {
  try {
    if (!supabase) return 'refused'
    const { error } = await supabase.from('rollcall').upsert({ person_id: personId, storm_ref: ref, status, at: new Date().toISOString() }, { onConflict: 'person_id,storm_ref' })
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

// ---- the shared Do now checklist: 4 family_tasks rows per storm, made once ----
export const STORM_TASKS = ['Charge phones and power banks', 'Pack 7 days of medicines in the go-bag', 'Fill water containers', 'Check on a neighbour'] as const
const NS = 'b4a7e1c2-5d3f-4a86-9e10-2f6c8d7b3a95' // Bantay storm checklist namespace (random, fixed)

/** RFC 4122 version 5 UUID: SHA-1 of the namespace bytes + the name. Same inputs, same id, on every phone. */
export async function uuidv5(name: string, ns: string = NS): Promise<string> {
  const nsBytes = ns.replace(/-/g, '').match(/../g)!.map((h) => parseInt(h, 16))
  const data = new Uint8Array([...nsBytes, ...new TextEncoder().encode(name)])
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16)
  h[6] = (h[6]! & 0x0f) | 0x50
  h[8] = (h[8]! & 0x3f) | 0x80
  const x = [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}
export const stormTaskId = (ref: string, item: string): Promise<string> => uuidv5(ref + item)

const DONE_KEY = 'storm.tasks' // storm refs whose checklist this phone already made (capped, ML-06)
const DONE_MAX = 10
const inflight = new Map<string, Promise<number>>()
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Make the storm's 4 tasks once. Returns how many rows were new here. A second call (mount, remount, another screen) adds 0: this phone remembers the storm,
 *  and a task that already arrived from another phone (same client_id) is not written again, so it cannot un-tick a task the family ticked. */
export function ensureStormTasks(ref: string): Promise<number> {
  const cur = inflight.get(ref)
  if (cur) return cur
  const p = (async () => {
    try {
      const raw = (await db.kv.get(DONE_KEY))?.value
      const seen = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
      if (seen.includes(ref)) return 0
      let made = 0
      for (const title of STORM_TASKS) {
        const clientId = await stormTaskId(ref, title)
        if (await fdb.tasks.where('clientId').equals(clientId).first()) continue
        await saveRow<FamilyTask>('family_tasks', { clientId, title, due: today(), assigneePersonId: null, done: false })
        made++
      }
      await db.kv.put({ key: DONE_KEY, value: [...seen, ref].slice(-DONE_MAX) })
      return made
    } catch {
      return 0 // storage blocked: try again on the next mount
    } finally {
      inflight.delete(ref)
    }
  })()
  inflight.set(ref, p)
  return p
}
