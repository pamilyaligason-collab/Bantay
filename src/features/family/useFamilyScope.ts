import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from '../auth/client'
import { getMember } from '../auth/session'
import { usePeople } from '../records/useRecordsServer'
import { useActing, useViewedVisibleIds } from '../viewas/viewAs'
import { useCarerIds } from './CarerCards'
import { carerUserId, loadCarerOf, useFlagLines, type CarerClient } from './reportData'
import { useFamilyPeople, type FamilyPerson } from './roster'

export interface FamilyScope {
  /** Who the "Who to show" sheet lists. */
  options: FamilyPerson[]
  /** The person picked, or null for Me (the default). While acting, the acting person. */
  selectedId: string | null
  select: (id: string) => void
  /** The person Family shows: the pick, else Me. id '' when this phone does not know who you are yet. */
  shown: FamilyPerson
  isOwner: boolean
}

// The pick lives in memory only (D-109): nothing in kv or localStorage, so Family opens on Me every time.
let picked: string | null = null
const subs = new Set<() => void>()
const setPicked = (id: string | null) => { if (id === picked) return; picked = id; for (const cb of [...subs]) cb() }
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb) } }
/** Family and the pages it opens (member page, Plan). Leaving them forgets the pick. */
const inFamily = (h: string) => /^#?(family|plan)(\/|$)/.test(h)
let wired = false
function wire() {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('hashchange', () => { if (!inFamily(location.hash)) setPicked(null) })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') setPicked(null) }) // lock, app switch: the next open is Me again, as the sheet promises
  void supabase?.auth?.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') setPicked(null) })
}
let lastActing: string | null | undefined
/** For tests: forget the pick. */
export const resetFamilyScope = () => { setPicked(null); lastActing = undefined }

const PLACEHOLDER: FamilyPerson = { id: '', name: 'You', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true }

/** Who Family may show. options = the people this phone may read (rows RLS lets through, from the people store) minus the shared family account, plus you; a cached sign-in name alone never lists anyone.
 *  While viewing as someone, the acting person is on show and the list is who they can see.
 *  shortcut: a non-owner admin would list everyone their RLS shows; no such login exists (plan 3.3 A), upgrade with part 2 of the D-109 plan. */
export function useFamilyScope(): FamilyScope {
  wire()
  const { people, selfId } = useFamilyPeople()
  const stored = usePeople()
  const { personId: actingId } = useActing()
  const visible = useViewedVisibleIds()
  const pick = useSyncExternalStore(subscribe, () => picked, () => picked)
  const [isOwner, setOwner] = useState(false)
  useEffect(() => {
    let live = true
    void getMember().then((m) => { if (live) setOwner(m?.isOwner === true) }).catch(() => { if (live) setOwner(false) }) // unknown = not the owner
    return () => { live = false }
  }, [])
  useEffect(() => { if (lastActing !== actingId) { lastActing = actingId; setPicked(null) } }, [actingId]) // View as starts or stops: back to the default
  const options = useMemo(() => {
    if (visible) return people.filter((p) => visible.has(p.id))
    const readable = new Set(stored.filter((p) => p.kind !== 'shared').map((p) => p.id))
    return people.filter((p) => p.isMe || readable.has(p.id))
  }, [people, stored, visible])
  const ok = (id: string | null) => !!id && options.some((p) => p.id === id)
  const selectedId = visible ? (ok(pick) ? pick : ok(actingId) ? actingId : null) : ok(pick) && pick !== selfId ? pick : null
  const shown = options.find((p) => p.id === selectedId) ?? options.find((p) => p.isMe) ?? (visible ? undefined : people.find((p) => p.isMe)) ?? (supabase ? undefined : options[0]) ?? PLACEHOLDER // a build with no sign-in (dev and e2e) has no accounts: the first person on the phone stands in for Me
  const select = useCallback((id: string) => setPicked(id === selfId || id === actingId ? null : id), [selfId, actingId])
  return { options, selectedId, select, shown, isOwner }
}

/** Person ids the user is linked to as a carer (read-only or writer). Only you until the links are read, so nobody else flashes up. */
export function useCarerOf(): string[] {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void carerUserId().then((u) => (u ? loadCarerOf(supabase as CarerClient | null, u) : [])).then((v) => { if (live) setIds(v) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  return ids
}

/** You and the people you are linked to (the owner can read everyone, but the People list, Calendar and Family health name only these). While viewing as someone, the people they can see. */
export function useLinkedPeople(): FamilyPerson[] {
  const { options } = useFamilyScope()
  const { acting } = useActing()
  const carerOf = useCarerOf()
  return useMemo(() => (acting || !supabase ? options : options.filter((p) => p.isMe || carerOf.includes(p.id))), [options, acting, carerOf])
}

/** Flag lines (a high reading, a missed medicine) for you and the people you are a writer carer of (D-109). A read-only link gets none. Viewing as someone, or a build with no sign-in, shows every line. */
export function useWriterFlags(people: FamilyPerson[]): Record<string, string> {
  const all = useFlagLines(people)
  const writable = useCarerIds()
  const { acting } = useActing()
  return useMemo(() => (acting || !supabase ? all : Object.fromEntries(Object.entries(all).filter(([id]) => writable.includes(id) || people.find((p) => p.id === id)?.isMe))), [all, writable, acting, people])
}
