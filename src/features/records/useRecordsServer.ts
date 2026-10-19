import { useCallback, useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { supabase } from '../auth/client'
import { hdb, type Person } from './store'
import { cacheDocs, cachedDocs, listConfirmedDocuments, listConfirmedMedicines, listQueue, type DocBundle, type RxItem } from './api'

/** "To check (N)": 0 while offline, signed out, or nothing waits. `error` is set when the server list could not be read, so the screen says so instead of hiding it. */
export function useQueue(enabled = true) {
  const [count, setCount] = useState(0)
  const [byPerson, setByPerson] = useState<Record<string, number>>({})
  const [error, setError] = useState(false)
  // With an auth client, INITIAL_SESSION (fires right after subscribe) makes the first call, once the session is restored.
  const [tick, setTick] = useState(supabase?.auth ? -1 : 0)
  const lastToken = useRef<string | null | undefined>(undefined)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (tick < 0 || !enabled) return
    let live = true
    void listQueue().then((r) => {
      if (!live) return
      setCount(r.ok ? r.data.total : 0)
      setByPerson(r.ok ? r.data.byPerson : {})
      setError(!r.ok && r.error !== 'not_connected' && r.error !== 'offline')
      if (!r.ok) console.warn('records queue failed', r.code ?? r.error)
    })
    return () => { live = false }
  }, [tick, enabled])
  // the session can finish restoring after the screen opened: ask again once it is signed in
  useEffect(() => {
    const sub = supabase?.auth?.onAuthStateChange((e, session) => {
      if (e !== 'SIGNED_IN' && e !== 'INITIAL_SESSION') return // TOKEN_REFRESHED is ignored
      const t = session?.access_token ?? null
      if (lastToken.current === t) return // one call per auth state
      lastToken.current = t
      refresh()
    })
    return () => sub?.data.subscription.unsubscribe()
  }, [refresh])
  return { count, byPerson, error, refresh }
}

/** Confirmed documents: the offline copy first, replaced by the server list when online. */
export function useConfirmedDocs(personId: string, version = 0) {
  const [docs, setDocs] = useState<DocBundle[]>([])
  useEffect(() => {
    if (!personId) return
    let live = true
    void cachedDocs(personId).then((d) => live && setDocs(d))
    void listConfirmedDocuments(personId).then((r) => {
      if (!live || !r.ok) return
      setDocs(r.data)
      void cacheDocs(personId, r.data)
    })
    return () => { live = false }
  }, [personId, version])
  return docs
}

/** Confirmed medicines from prescriptions for one person, newest first. `null` until the first answer; stays empty offline. */
export function useConfirmedMedicines(personId: string, version = 0) {
  const [items, setItems] = useState<RxItem[] | null>(null)
  useEffect(() => {
    if (!personId) { setItems(null); return }
    let live = true
    setItems(null)
    void listConfirmedMedicines(personId).then((r) => live && setItems(r.ok ? r.data : []))
    return () => { live = false }
  }, [personId, version])
  return items
}

/** People from the local store, live: sync may pull them after the screen opened. */
export function usePeople(initial: Person[] = []) {
  const [people, setPeople] = useState(initial)
  useEffect(() => {
    const sub = liveQuery(() => hdb.people.toArray()).subscribe({ next: (p) => p.length && setPeople(p), error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  return people
}
