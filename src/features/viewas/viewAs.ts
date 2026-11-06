import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { track } from '../admin/events'
import { getMember } from '../auth/session'
import { leaveSheet } from '../look/Sheet'
import { selfIdOrCached } from '../sync/profile'
import { useSelfPersonId } from '../setup/useProfile'
import { actingEpoch, getActingPersonId, getActingState, setActing, subscribeActing, type ActingCan, type ActingState } from './store'

// S16 C-9 / PLAN 1.6 (D-99). The admin views AND acts for one member; the id lives in memory only.
// Every write still carries the admin as actor; RLS (not this file) decides what is allowed. These flags only mirror it so the UI can say so.

export const NO_ACCESS = 'Could not check your access. Tap Back to me and try again online.'
/** Who the admin is and who the viewed person is, as far as this phone knows. `hasLogin` null = unknown. */
export type ReasonCtx = { owner?: boolean; hasLogin?: boolean | null }
/** Why logging is locked (D-120, D-125, D-128). share_set (0046) never makes the owner a carer, so the owner's lines never promise it; they only say what is true.
 *  A person with a login logs for themself only. For a person with no login a carer with edit access is needed. Unknown fails closed to a line that is true either way. */
export const reasonFor = (name: string, ctx: ReasonCtx = {}) =>
  ctx.owner && ctx.hasLogin === false ? `You can see ${name}'s records. Logging for ${name} needs a carer with edit access.`
  : ctx.owner && ctx.hasLogin === true ? `${name} has their own login, so only ${name} can log.`
  : ctx.owner ? `You can see ${name}'s records but not log for ${name}.`
  : `You can see ${name} but not log for them. Only the family owner can make you a carer with edit access, and only for a person with no login.`

/** What the admin may do for the member: log = self or a can_write carer link (meds_taken/readings/activity RLS 0003:88, 0001:115; app admin alone does not count);
 *  edit = log or admin (records_editor, nutrition); rollcall = family member and log (0041:71, an admin is always an app_roles member); mood = log. */
export function canFor(isAdmin: boolean, writer: boolean, name: string, ctx?: ReasonCtx): ActingCan {
  return { log: writer, edit: writer || isAdmin, rollcall: writer && isAdmin, mood: writer, reason: writer ? null : reasonFor(name, ctx) }
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
      if (r.ok) {
        const writer = r.data.some((c) => c.carer_id === m.userId && c.person_id === personId && c.can_write)
        let hasLogin: boolean | null = null // the reason line only; the flags above never depend on it
        if (!writer && m.isOwner === true) {
          try { const { loadRoster } = await import('../admin/desk/viewAsData'); const row = (await loadRoster())?.people.find((p) => p.id === personId); if (row) hasLogin = !!row.auth_user_id } catch { /* unknown */ }
        }
        can = canFor(true, writer, name, { owner: m.isOwner === true, hasLogin })
      }
    } catch { /* NONE: every flag false with the reason */ }
    if (actingEpoch() !== started) return false // Back to me or sign-out happened while we were waiting
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
        if (live) setGot({ id, ids: new Set([id, ...shown.filter((v) => v.records).map((v) => v.person.id)]) }) // a person they only created (records: false) is not one they can read
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

/** The signed-in admin's own first name, for "Sent as Rey" and "This SOS is from Rey" (m2-6). 'you' until it is known. */
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

/** The one Could-not-switch line for every View as button. */
export const SWITCH_FAILED = 'Could not switch. Check your internet and try again.'

/** For the View as buttons in the switcher and on the member page: `can` is an admin who is not already viewing as someone.
 *  `go` runs enterActing (audit row first), then opens Today as that person; on false it stays and sets `err`. A second tap while one is running is ignored. */
export function useViewAs(): { can: boolean; busy: string | null; err: string; go: (id: string, done?: () => void) => Promise<void> } {
  const [admin, setAdmin] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const running = useRef(false)
  const { acting } = useActing()
  useEffect(() => {
    let live = true
    void getMember().then((m) => { if (live) setAdmin(m?.role === 'admin') }, () => undefined)
    return () => { live = false }
  }, [])
  const go = async (id: string, done?: () => void) => {
    if (running.current) return
    running.current = true
    setBusy(id); setErr('')
    const ok = await enterActing(id).catch(() => false)
    running.current = false
    setBusy(null)
    if (ok) leaveSheet(() => { done?.(); location.hash = '#today' }) // pop the open sheet's history entry first: one Back from Today, no dead entry
    else setErr(SWITCH_FAILED)
  }
  return { can: admin && !acting, busy, err, go }
}
