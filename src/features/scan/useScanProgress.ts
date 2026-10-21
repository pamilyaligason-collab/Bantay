// "Uploading N · Reading N" on the Papers screen. Uploading = scanned papers still in this phone's queue (counted per document, not per page).
// Reading = scanned papers already on the server that it has not read yet (draft, files still 'new'). Both are 0 when nothing is going on.
import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { ddb } from '../docs/store'
import { listReading } from '../records/api'

const POLL_MS = 20_000

export function useScanProgress(personId: string, version = 0) {
  const [uploading, setUploading] = useState(0)
  const [reading, setReading] = useState(0)
  useEffect(() => {
    if (!personId) return
    const sub = liveQuery(async () => new Set((await ddb.queue.toArray()).filter((q) => q.pages && q.personId === personId).map((q) => q.docId)).size)
      .subscribe({ next: setUploading, error: () => setUploading(0) })
    return () => sub.unsubscribe()
  }, [personId])
  useEffect(() => {
    if (!personId) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      const r = await listReading(personId)
      if (!live) return
      setReading(r.ok ? r.data.length : 0)
      if (r.ok && r.data.length) timer = setTimeout(() => void load(), POLL_MS) // keep looking while something is being read
    }
    void load()
    return () => { live = false; clearTimeout(timer) }
  }, [personId, version, uploading])
  return { uploading, reading }
}
