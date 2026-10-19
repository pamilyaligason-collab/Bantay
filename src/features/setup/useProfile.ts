import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type ProfileRow } from '../../db'
import { SELF_ID, selfIdNow, signedAvatar } from '../sync/profile'

/** One person's profile row, live. undefined until read, null when there is none yet. */
export function useProfile(personId: string | null | undefined): ProfileRow | null | undefined {
  const [row, setRow] = useState<ProfileRow | null | undefined>(undefined)
  useEffect(() => {
    if (!personId) return setRow(null)
    const sub = liveQuery(() => db.profiles.get(personId)).subscribe({ next: (r) => setRow(r ?? null), error: () => setRow(null) })
    return () => sub.unsubscribe()
  }, [personId])
  return row
}

/** Everyone's profile rows this member can see, keyed by person id. */
export function useProfiles(): Record<string, ProfileRow> {
  const [map, setMap] = useState<Record<string, ProfileRow>>({})
  useEffect(() => {
    const sub = liveQuery(() => db.profiles.toArray()).subscribe({ next: (rows) => setMap(Object.fromEntries(rows.map((r) => [r.id, r]))), error: () => undefined })
    return () => sub.unsubscribe()
  }, [])
  return map
}

/** The signed-in person's id; falls back to the one cached on this phone when offline. */
export function useSelfPersonId(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const fresh = await selfIdNow()
      const cached = fresh ?? (((await db.kv.get(SELF_ID).catch(() => undefined))?.value as string | undefined) ?? null)
      if (live) setId(cached)
    })()
    return () => { live = false }
  }, [])
  return id
}

/** A photo URL for a path, or null while loading / when there is none. */
function useSigned(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    void signedAvatar(path).then((u) => { if (live) setUrl(u) })
    return () => { live = false }
  }, [path])
  return url
}

/** A kv value that follows later writes (a sync or another screen), unlike useKv which reads once. */
function useLiveKv<T>(key: string): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    const sub = liveQuery(() => db.kv.get(key)).subscribe({ next: (r) => setV((r?.value as T | undefined) ?? null), error: () => undefined })
    return () => sub.unsubscribe()
  }, [key])
  return v
}

/** This phone's own photo: the cached picture first (instant, works offline), else the server photo. */
export function useOwnAvatar(): string | null {
  const local = useLiveKv<string>('profile.photo')
  const path = useLiveKv<string>('profile.photoPath')
  const server = useSigned(local ? null : path)
  return local || server
}

/** Another family member's photo (signed link), or null. */
export function useAvatar(personId: string | null | undefined): string | null {
  return useSigned(useProfile(personId)?.photoPath)
}
