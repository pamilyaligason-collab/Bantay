import { useState } from 'react'
import { useFamilyPeople } from '../family/roster'
import { useTakenToday } from '../health/useActivity'
import { useMedications } from '../health/useMedications'
import { dayOf, matchDoses, slotsFor } from '../health/meds'
import { logDose } from '../log/store'
import { Icon } from '../shell/Icon'
import { useActingCan } from '../viewas/viewAs'
import type { MyTake } from '../today/useMyTakes'
import { shortName } from './build'

/** The slot ("HH:MM") and Manila day a missed-dose row is about, read from its dedupe ref ("<id>:2026-10-26:09:00"); null parts when the ref has no such text. */
export function doseRef(ref: string | null): { day: string | null; slot: string | null } {
  const m = /(\d{4}-\d{2}-\d{2})(?::([01]\d|2[0-3]):([0-5]\d))?/.exec(ref ?? '')
  return { day: m?.[1] ?? null, slot: m?.[2] ? `${m[2]}:${m[3]}` : null }
}

/** lock-missed actions under a missed-dose row: Call, Mark taken for her (asks first: "Did you see her take it?"), Message the family.
 *  Mark taken logs the dose through the normal medicine log for that slot; only offered for today's slot that is still open on this phone. */
export function MissedDoseActions({ personId, refText, now = new Date() }: { personId: string | null; refText: string | null; now?: Date }) {
  const { people } = useFamilyPeople()
  const person = personId ? people.find((p) => p.id === personId) : undefined
  const name = shortName(person?.name) ?? 'them'
  const meds = useMedications(personId ?? '')
  const takes = useTakenToday(personId ?? '', { includeSkipped: true }) as MyTake[]
  const can = useActingCan()
  const viewOnly = can != null && !can.log // viewing as a member the admin cannot log for (RLS would refuse): say so instead of failing
  const [ask, setAsk] = useState(false)
  const [done, setDone] = useState(false)
  const { day, slot } = doseRef(refText)
  const today = dayOf(now)
  const open = personId && slot && (day == null || day === today)
    ? matchDoses(slotsFor(meds, personId, today), takes, today).filter((d) => d.slot === slot && d.state === 'pending')
    : []
  const mark = async () => {
    for (const d of open) { const med = meds.find((m) => m.serverId === d.medicationId && m.name === d.name) ?? meds.find((m) => m.name === d.name); if (med) await logDose(med, d.slot) }
    setAsk(false); setDone(true)
  }
  return (
    <div className="in-actions" role="group" aria-label="What you can do">
      {person?.phone
        ? <a className="btn in-act" href={`tel:${person.phone}`}>Call {name}</a>
        : personId ? <a className="btn in-act" href={`#family/people/${personId}`}>Open {name}</a> : null}
      {done
        ? <span className="sh-sub" role="status">Marked as taken</span>
        : open.length > 0 && !ask && (viewOnly
          ? <button type="button" className="btn in-act" disabled title={can?.reason ?? undefined}><Icon name="lock" size={16} /> Mark taken for {name} · View only</button>
          : <button type="button" className="btn in-act" onClick={() => setAsk(true)}>Mark taken for {name}</button>)}
      <a className="btn in-act" href="#family/messages">Message the family</a>
      {ask && (
        <div className="in-confirm" role="alertdialog" aria-label="Confirm">
          <b>Did you see {name} take it?</b>
          <div className="in-actions">
            <button type="button" className="btn in-act" onClick={() => void mark()}>Yes, I saw</button>
            <button type="button" className="btn in-act" onClick={() => setAsk(false)}>Not sure</button>
          </div>
        </div>
      )}
    </div>
  )
}
