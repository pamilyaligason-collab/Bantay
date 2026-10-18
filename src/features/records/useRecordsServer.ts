import { useCallback, useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { hdb, type Person } from './store'
import { cacheDocs, cachedDocs, listConfirmedDocuments, listQueue, type DocBundle } from './api'

/** "To check (N)": 0 while offline, signed out, or nothing waits. */
export function useQueue() {
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    void listQueue().then((r) => live && setCount(r.ok ? r.data.total : 0))
    return () => { live = false }
  }, [tick])
  return { count, refresh: useCallback(() => setTick((t) => t + 1), []) }
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
