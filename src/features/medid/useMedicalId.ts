import { useEffect, useMemo } from 'react'
import { db } from '../../db'
import { loadFamily } from '../auth/family'
import { useKv } from '../shell/useKv'
import { normalizeContacts } from '../sos/contacts'
import { useSelf } from '../sos/useSelf'
import { usePeople } from '../records/useRecordsServer'
import { useAvatar, useOwnAvatar, useProfile } from '../setup/useProfile'
import { useMedicationRows } from '../health/useMedicationRows'
import { buildMedicalId, hasData, type MedicalId } from './card'

export const CACHE_KEY = 'medid.cache'
interface Cache { personId: string; card: MedicalId; at: number }
const NONE: unknown[] = []

/** The signed-in person's Medical ID, built from their people row and SOS contacts.
 *  Each good build is kept in kv `medid.cache`; with no row yet (offline, first open) the cache is shown instead. */
export function useMedicalId(otherId?: string | null): { card: MedicalId; photo: string | null; fromCache: boolean; ready: boolean; other: boolean } {
  const self = useSelf()
  // #medid/<id>: another person's card, only if their row is one this member can already read. Their SOS contacts are not ours, so none are shown.
  const other = !!otherId && otherId !== self.personId
  const people = usePeople()
  const personId = other ? otherId : self.personId
  const name = other ? (people.find((p) => p.id === otherId)?.name ?? '') : self.name
  const profile = useProfile(personId)
  const medications = useMedicationRows(personId) // undefined while loading, so the card does not flash "no medicines"
  const ownPhoto = useOwnAvatar()
  const otherPhoto = useAvatar(other ? otherId : null)
  const photo = other ? otherPhoto : ownPhoto
  const [raw, , rawLoaded] = useKv<unknown[]>('sos.contacts', NONE)
  const [cache, , cacheLoaded] = useKv<Cache | null>(CACHE_KEY, null)
  const fresh = useMemo(
    () => buildMedicalId({ name, profile, contacts: other ? [] : normalizeContacts(raw, loadFamily()), now: new Date(), medications }),
    [name, profile, raw, other, medications]
  )
  const live = hasData(fresh)
  useEffect(() => {
    if (live && personId && rawLoaded && !other) void db.kv.put({ key: CACHE_KEY, value: { personId, card: fresh, at: Date.now() } satisfies Cache }).catch(() => undefined)
  }, [live, personId, fresh, rawLoaded, other])
  const cached = !other && cache && cache.personId === personId ? cache.card : null
  const useCache = !live && !!cached
  // The cached card has its own name and calls; today's contacts and name win when we have them.
  const calls = !useCache || fresh.calls.length ? fresh.calls : cached.calls
  const card: MedicalId = useCache
    ? { ...cached, name: fresh.name || cached.name, calls, missing: [...cached.missing.filter((m) => m !== 'calls'), ...(calls.length ? [] : (['calls'] as const))] }
    : fresh
  return { card, photo, fromCache: useCache, ready: profile !== undefined && cacheLoaded && rawLoaded, other }
}
