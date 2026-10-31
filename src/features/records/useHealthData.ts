import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getMember, type Member } from '../auth/session'
import { labName } from '../../lib/labFormat'
import { selfIdOrCached } from '../sync/profile'
import { loadAll } from './store'
import { usePeople } from './useRecordsServer'

type Data = Awaited<ReturnType<typeof loadAll>>
const empty: Data = { people: [], readings: [], consults: [], thresholds: [] }

// The person chosen on Records or Health. Module-level so both screens (and every hook user) stay in sync.
let chosen = ''
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => (listeners.add(cb), () => void listeners.delete(cb))
const setChosen = (id: string) => { chosen = id; listeners.forEach((l) => l()) }

export function useHealthData() {
  const [data, setData] = useState<Data>(empty)
  const [ready, setReady] = useState(false)
  const [member, setMember] = useState<Member | null>(null)
  const [memberReady, setMemberReady] = useState(false) // ready only once we know who "me" is, or that nobody is signed in
  const [tick, setTick] = useState(0)
  const picked = useSyncExternalStore(subscribe, () => chosen)
  const stored = usePeople(data.people) // live: sync may pull people after the screen opened
  useEffect(() => {
    let live = true
    loadAll()
      .then((d) => live && setData(d))
      .catch(() => {}) // storage blocked: show the empty state
      .finally(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [tick])
  useEffect(() => {
    let live = true
    const slow = setTimeout(() => live && setMemberReady(true), 3000) // a hung auth call must not keep Health on its loading state
    getMember().then(async (m) => { const mm = m && !m.personId ? { ...m, personId: (await selfIdOrCached().catch(() => null)) ?? null } : m; if (live) setMember(mm) }).catch(() => {}).finally(() => live && setMemberReady(true)) // not signed in or no auth: no "me"
    return () => {
      live = false
      clearTimeout(slow)
    }
  }, [])
  const ownId = member?.personId ?? ''
  // "Me" first, then the rest by name, so the picker reads the same on every screen.
  const people = [...stored].sort((a, b) => (a.id === ownId ? -1 : b.id === ownId ? 1 : a.name.localeCompare(b.name)))
  const known = (id: string) => !!id && (people.some((p) => p.id === id) || data.readings.some((r) => r.personId === id))
  const firstWithData = people.find((p) => data.readings.some((r) => r.personId === p.id))?.id ?? people[0]?.id ?? data.readings[0]?.personId ?? ''
  // chosen person, else the signed-in member's own person, else the first one with readings (Dexie order is arbitrary, hence the sort above)
  const personId = known(picked) ? picked : known(ownId) ? ownId : firstWithData
  const setPersonId = useCallback((id: string) => setChosen(id), [])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const readings = data.readings.filter((r) => r.personId === personId)
  const consults = data.consults.filter((c) => c.personId === personId)
  return { ...data, people, ready: ready && memberReady, member, ownId, personId, setPersonId, readings, consults, reload }
}

/** Test helper: forget the shared choice. */
export const resetPersonChoice = () => setChosen('')

export const testLabel = (key: string, guide: Record<string, { label: string }>) => guide[key]?.label ?? labName(key)
