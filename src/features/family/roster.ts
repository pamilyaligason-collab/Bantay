import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { loadFamily } from '../auth/family'
import { ldb } from '../log/store'
import { usePeople } from '../records/useRecordsServer'
import { useProfiles, useSelfPersonId } from '../setup/useProfile'

export interface FamilyPerson {
  id: string
  name: string
  photoPath: string | null
  /** Small cached picture from the sign-in list (data URL), used until the real photo loads. */
  thumb: string | null
  phone: string | null
  birthdate: string | null
  isMe: boolean
}

/** Everyone this phone knows: people rows it can read (me, carer-linked) plus the family list cached at sign-in. "Me" first, then by name. */
export function useFamilyPeople(): { people: FamilyPerson[]; selfId: string | null } {
  const stored = usePeople()
  const profiles = useProfiles()
  const selfId = useSelfPersonId()
  const people = useMemo(() => {
    const cached = loadFamily()
    const ids = new Set([...stored.map((p) => p.id), ...cached.map((c) => c.personId)])
    const list = [...ids].map((id): FamilyPerson => {
      const s = stored.find((p) => p.id === id)
      const c = cached.find((m) => m.personId === id)
      const p = profiles[id]
      return { id, name: s?.name ?? c?.displayName ?? 'Family member', photoPath: p?.photoPath ?? null, thumb: c?.photo ?? null, phone: p?.phone ?? null, birthdate: p?.birthdate ?? null, isMe: id === selfId }
    })
    return list.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name))
  }, [stored, profiles, selfId])
  return { people, selfId }
}

/** Each person's latest "I'm OK" (activity of kind check-in), live. */
export function useCheckIns(): Record<string, string> {
  const [last, setLast] = useState<Record<string, string>>({})
  useEffect(() => {
    const sub = liveQuery(() => ldb.activity.filter((a) => a.kind === 'check-in').toArray()).subscribe({ next: (rows) => setLast(latestCheckIns(rows)), error: () => undefined })
    return () => sub.unsubscribe()
  }, [])
  return last
}

export const latestCheckIns = (rows: { personId: string; kind: string; startedAt: string }[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const r of rows) if (r.kind === 'check-in' && (!out[r.personId] || r.startedAt > out[r.personId]!)) out[r.personId] = r.startedAt
  return out
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const clock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "OK 7:40 AM" when they checked in today, else "No check-in today". */
export function checkInLabel(iso: string | undefined, now = new Date()): { ok: boolean; text: string } {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) && sameDay(d, now) ? { ok: true, text: `OK ${clock(d)}` } : { ok: false, text: 'No check-in today' }
}
/** "Mon 19 Oct, 7:40 AM" for the member page, or null when there is none. */
export function lastCheckIn(iso: string | undefined): string | null {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return null
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${clock(d)}`
}

/** Whole years from a yyyy-mm-dd birthday, or null when unknown or not a real date. */
export function ageOf(birthdate: string | null, now = new Date()): number | null {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null
  const b = new Date(`${birthdate}T00:00:00`)
  if (Number.isNaN(b.getTime()) || b > now) return null
  let age = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--
  return age
}

/** How many of the family checked in today, over how many people. */
export function rollCall(people: FamilyPerson[], last: Record<string, string>, now = new Date()) {
  const ok = people.filter((p) => checkInLabel(last[p.id], now).ok).length
  return { ok, total: people.length }
}
