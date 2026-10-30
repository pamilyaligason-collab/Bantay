import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { track } from '../admin/events'
import { getMember } from '../auth/session'
import { selfIdOrCached } from '../sync/profile'
import { useSelfPersonId } from '../setup/useProfile'
import { actingEpoch, getActingPersonId, getActingState, setActing, subscribeActing, type ActingCan, type ActingState } from './store'

// S16 C-9 / PLAN 1.6 (D-99). The admin looks at AND acts for one member; the id lives in memory only.
// Every write still carries the admin as actor; RLS (not this file) decides what is allowed. These flags only mirror it so the UI can say so.

export const NO_ACCESS = 'Could not check your access. Exit and try again online.'
export const reasonFor = (name: string) => `You can see ${name} but not log for her. Ask her (or an admin) to make you a carer with edit access.`

/** What the admin may do for the member: log = self or a can_write carer link (meds_taken/readings/activity RLS 0003:88, 0001:115; app admin alone does not count);
 *  edit = log or admin (records_editor, nutrition); rollcall = family member and log (0041:71, an admin is always an app_roles member); mood = log. */
export function canFor(isAdmin: boolean, writer: boolean, name: string): ActingCan {
  return { log: writer, edit: writer || isAdmin, rollcall: writer && isAdmin, mood: writer, reason: writer ? null : reasonFor(name) }
}
const NONE: ActingCan = { log: false, edit: false, rollcall: false, mood: false, reason: NO_ACCESS }

const first = (n: string) => n.trim().split(/\s+/)[0] || n
/** First name of a person this phone knows (people rows, else the sign-in list cache), or `fallback`. */
async function nameOf(personId: string, fallback = 'this person'): Promise<string> {
  try {
    const { hdb } = await import('../records/store')
    const p = await hdb.people.get(personId)
    if (p?.name) return first(p.name)
    const { loadFamily } = await import('../auth/family')
    const c = loadFamily().find((m) => m.personId === personId)
    if (c?.displayName) return first(c.displayName)
  } catch { /* fall through */ }
  return fallback
}

/** Admin only. False for the admin's own person (r3-4), for a non-admin, offline, or when the audit row (admin_log_view_as, 0029) could not be written:
 *  a session without its audit row never starts. The access flags are worked out here once, online, and cached in memory (m2-1). */
export async function enterActing(personId: string): Promise<boolean> {
  if (!personId) return false
  if (getActingPersonId() === personId) return true
  try {
    const m = await getMember().catch(() => null)
    if (!m || m.role !== 'admin') return false
    if (m.personId === personId || (await selfIdOrCached().catch(() => null)) === personId) return false // you cannot act as yourself; no audit row
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
    const started = actingEpoch()
    const { hdb } = await import('../records/store')
    if (!(await hdb.people.get(personId))) return false // a person only in the sign-in list cache: acting would end at once (the bar exits), so spend no audit row
    const { logViewAs } = await import('../admin/desk/viewAsData')
    if (!(await logViewAs(personId))) return false
    const name = await nameOf(personId)
    let can = NONE
    try {
      const { listCarers } = await import('../admin/api')
      const r = await listCarers()
      if (r.ok) can = canFor(true, r.data.some((c) => c.carer_id === m.userId && c.person_id === personId && c.can_write), name)
    } catch { /* NONE: every flag false with the reason */ }
    if (actingEpoch() !== started) return false // Exit or sign-out happened while we were waiting
    setActing({ personId, name, can })
    void import('../records/useHealthData').then((h) => h.resetPersonChoice()).catch(() => undefined) // the Health picker starts on the acting person
    void track('action', 'acting_enter') // fixed name only, no person id (C-4 events)
    return true
  } catch {
    return false
  }
}

export function exitActing(): void {
  if (getActingPersonId() === null) return
  setActing(null)
  void import('../records/useHealthData').then((h) => h.resetPersonChoice()).catch(() => undefined)
  void track('action', 'acting_exit')
}

const useState_ = (): ActingState | null => useSyncExternalStore(subscribeActing, getActingState, getActingState)

/** The acting member's id while acting, else the signed-in person's own id (B-3). */
export function useActingPersonId(): string | null {
  const own = useSelfPersonId()
  return useState_()?.personId ?? own
}

export function useActing(): { acting: boolean; personId: string | null; name: string } {
  const s = useState_()
  return useMemo(() => ({ acting: !!s, personId: s?.personId ?? null, name: s?.name ?? '' }), [s])
}

/** The people the acting person can see (what their own phone would list), or null when not acting. Fails closed to just the acting person when the roster cannot be read (R-3). */
export function useViewedVisibleIds(): Set<string> | null {
  const s = useState_()
  const id = s?.personId
  const [got, setGot] = useState<{ id: string; ids: Set<string> } | null>(null)
  useEffect(() => {
    if (!id) { setGot(null); return }
    let live = true
    void (async () => {
      try {
        const { loadRoster, visibleTo } = await import('../admin/desk/viewAsData')
        const r = await loadRoster()
        const me = r?.people.find((p) => p.id === id)
        if (!r || !me?.auth_user_id) return // no login = sees only themselves
        const { shown } = visibleTo(me.auth_user_id, r.people, r.carers, false)
        if (live) setGot({ id, ids: new Set([id, ...shown.map((v) => v.person.id)]) })
      } catch { /* closed */ }
    })()
    return () => { live = false }
  }, [id])
  return useMemo(() => (id ? (got?.id === id ? got.ids : new Set([id])) : null), [id, got])
}

/** What this admin may do for the acting person, or null when not acting. */
export function useActingCan(): ActingCan | null {
  return useState_()?.can ?? null
}

/** The signed-in admin's own first name, for "Sent as Lloyd" and "This SOS is from Lloyd" (m2-6). 'you' until it is known. */
export function useActorName(): string {
  const own = useSelfPersonId()
  const [n, setN] = useState('you')
  useEffect(() => {
    let live = true
    if (own) void nameOf(own, 'you').then((v) => { if (live) setN(v) })
    return () => { live = false }
  }, [own])
  return n
}
