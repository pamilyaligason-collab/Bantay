import { useCallback, useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { supabase } from '../auth/client'
import { hdb, type Person } from './store'
import { cacheDocs, cachedDocs, listConfirmedDocuments, listQueue, type DocBundle } from './api'

/** "To check (N)": 0 while offline, signed out, or nothing waits. `error` is set when the server list could not be read, so the screen says so instead of hiding it. */
export function useQueue() {
  const [count, setCount] = useState(0)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    let live = true
    void listQueue().then((r) => {
      if (!live) return
      setCount(r.ok ? r.data.total : 0)
      setError(!r.ok && r.error !== 'not_connected' && r.error !== 'offline')
      if (!r.ok) console.warn('records queue failed', r.code ?? r.error)
    })
    return () => { live = false }
  }, [tick])
  // the session can finish restoring after the screen opened: ask again once it is signed in
  useEffect(() => {
    const sub = supabase?.auth?.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'INITIAL_SESSION' || e === 'TOKEN_REFRESHED') refresh() })
    return () => sub?.data.subscription.unsubscribe()
  }, [refresh])
  return { count, error, refresh }
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

/** People from the local store, live: sync may pull them after the screen opened. */
export function usePeople(initial: Person[] = []) {
  const [people, setPeople] = useState(initial)
  useEffect(() => {
    const sub = liveQuery(() => hdb.people.toArray()).subscribe({ next: (p) => p.length && setPeople(p), error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  return people
}
