import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getMember, type Member } from '../auth/session'
import { labName } from '../../lib/labFormat'
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
    getMember().then((m) => live && setMember(m)).catch(() => {}) // not signed in or no auth: no "me"
    return () => {
      live = false
    }
  }, [])
  const ownId = member?.personId ?? ''
  // "Me" first, then the rest by name, so the picker reads the same on every screen.
  const people = [...stored].sort((a, b) => (a.id === ownId ? -1 : b.id === ownId ? 1 : a.name.localeCompare(b.name)))
  const known = (id: string) => !!id && (people.some((p) => p.id === id) || data.readings.some((r) => r.personId === id))
  // chosen person, else the signed-in member's own person, else the first one (Dexie order is arbitrary, hence the sort above)
  const personId = known(picked) ? picked : known(ownId) ? ownId : (people[0]?.id ?? data.readings[0]?.personId ?? '')
  const setPersonId = useCallback((id: string) => setChosen(id), [])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const readings = data.readings.filter((r) => r.personId === personId)
  const consults = data.consults.filter((c) => c.personId === personId)
  return { ...data, people, ready, member, ownId, personId, setPersonId, readings, consults, reload }
}

/** Test helper: forget the shared choice. */
export const resetPersonChoice = () => setChosen('')

export const testLabel = (key: string, guide: Record<string, { label: string }>) => guide[key]?.label ?? labName(key)
