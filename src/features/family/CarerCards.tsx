import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { getZone, wallToMs } from '../time/zone'
import { isLive, manilaDay, reviewAgeDays } from '../health/meds'
import { useWritableIds } from '../health/useCanMark'
import { doseRef } from '../inbox/MissedDoseActions'
import type { Medication } from '../log/store'
import { useFamilyPeople, type FamilyPerson } from './roster'

/** The carer helpers Family, Today and the inbox share: who this user looks after, the "Still taking it?" nobody answered, how long ago a slot was, and which missed-dose rows are today's.
 *  The old "Needs you now" card component that sat here was not mounted by any screen (S30 L9 removed it; Family renders NeedsList). */
export interface ReviewAsk { person: FamilyPerson; med: Medication; days: number }

/** Live medicines whose "Still taking it?" has been open for a day or more, for the people given; the oldest question first. */
export function reviewAsks(meds: Medication[], people: FamilyPerson[], today: Date = new Date()): ReviewAsk[] {
  const out: ReviewAsk[] = []
  for (const med of meds) {
    const person = people.find((p) => p.id === med.personId)
    const days = isLive(med) ? reviewAgeDays(med, today) : null
    if (person && days != null && days >= 1) out.push({ person, med, days })
  }
  return out.sort((a, b) => b.days - a.days || a.med.name.localeCompare(b.med.name))
}

/** "1 h 10 min ago" for a day + 'HH:MM' slot; '' when it is not in the past or the parts are missing. */
export function slotAgo(day: string | null, slot: string | null, now: Date = new Date(), tz: string = getZone()): string {
  const at = day && slot ? wallToMs(tz, day, slot) : NaN // the slot's wall clock in the person's zone (S30 L8)
  const min = Math.floor((now.getTime() - at) / 60_000)
  if (Number.isNaN(min) || min < 0) return ''
  return min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''} ago`
}

function useUserId(): string | undefined {
  const [id, setId] = useState<string>()
  useEffect(() => {
    let live = true
    void supabase?.auth?.getSession().then(({ data }) => { if (live) setId(data.session?.user.id) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  return id
}

/** A dose row that is today's (on the PERSON's zone) or has no day. Older ones stay in the alert list. */
export const showsAsCard = (ref: string | null, now: Date = new Date(), tz: string = getZone()) => { const { day } = doseRef(ref); return day == null || day === manilaDay(now, tz) } // the ref's day is the server's day on the PERSON's zone (people.tz)

/** The people this user looks after as a writer carer (never themself); empty until the carers list is read, or when signed out. */
export function useCarerIds(): string[] {
  const { selfId } = useFamilyPeople()
  return useWritableIds(useUserId()).filter((id) => id !== selfId)
}
