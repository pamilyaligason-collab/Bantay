import { useEffect, useState } from 'react'
import { db, enqueue } from '../../db'
import { supabase } from '../auth/client'
import { shortName } from '../inbox/build'
import { markSeen } from '../notify/store'
import { useAlertRows } from '../notify/useAlerts'
import { callFirstContact } from '../sos/call'
import { mapLink } from '../sos/sms'
import { Icon } from '../shell/Icon'
import { dial, useFamilyPeople } from './roster'
import './family.css'
import { pickSos } from './sosActive'

export { pickSos, useSosActive } from './sosActive'

/** The red SOS banner at the top of Today and Family (D-78, mockup lock-sos). A family SOS reaches a carer's Bantay as a `sos` row with template `family_sos`;
 *  the instant part is the elder's own phone (it dials and opens a text). This banner is the saved record, shown each time Bantay is opened until the carer marks it handled.
 *  A late row (`sos_late`) is a quiet line in the alert list, never this banner; a cancelled SOS (`sos_cancel` row or cancelled_at) hides it. */
interface SosEventRow { id: string; person_id: string; at: string; lat: number | null; lon: number | null; gps: boolean | null; cancelled_at: string | null }

const ACKED_KEY = 'sos.acked' // the last SOS ids this phone has told the server it saw (ML-06: capped)
const ACKED_MAX = 20

const clock = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).format(t)
}
const known = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** The saved SOS row (family members may read it). null until it arrives, and offline: the banner then uses the alert row's own time. */
function useSosEvent(id: string | null): SosEventRow | null {
  const [ev, setEv] = useState<SosEventRow | null>(null)
  useEffect(() => {
    setEv(null)
    const sb = supabase
    if (!sb || !id) return
    let live = true
    void (async () => {
      try {
        const { data } = await sb.from('sos_events').select('id,person_id,at,lat,lon,gps,cancelled_at').eq('id', id).maybeSingle()
        if (live && data) setEv(data as SosEventRow)
      } catch { /* offline: the alert row still says who and when */ }
    })()
    return () => { live = false }
  }, [id])
  return ev
}

/** Tell the server this carer has seen the SOS (a sos_acks row through the outbox, so it also works offline). Once per SOS: the server ignores a duplicate anyway. */
async function ack(eventId: string): Promise<void> {
  try {
    const cur = (await db.kv.get(ACKED_KEY))?.value
    const seen = Array.isArray(cur) ? cur.filter((x): x is string => typeof x === 'string') : []
    if (seen.includes(eventId)) return
    await enqueue('sos_acks', 'insert', { eventId, seenAt: new Date().toISOString() })
    await db.kv.put({ key: ACKED_KEY, value: [...seen, eventId].slice(-ACKED_MAX) })
  } catch { /* storage unavailable: the next open tries again */ }
}

export function IncomingSos({ placement }: { placement: 'today' | 'family' }) {
  const row = pickSos(useAlertRows())
  const { people } = useFamilyPeople()
  const eventId = row?.ref ?? null
  const ev = useSosEvent(eventId)
  useEffect(() => { if (eventId) void ack(eventId) }, [eventId])
  if (!row || ev?.cancelled_at) return null
  const person = people.find((p) => p.id === (ev?.person_id ?? row.personId))
  const name = shortName(person?.name) ?? 'Someone'
  const time = clock(ev?.at ?? row.createdAt)
  const call = dial(person?.phone ?? null)
  const hasPlace = ev != null && known(ev.lat) && known(ev.lon)
  return (
    <section className="fm-sos" role="alert" aria-label={`${name} needs help`} data-placement={placement} data-testid="incoming-sos">
      <div className="fm-sos-top">
        <span className="fm-sos-ic" aria-hidden="true"><Icon name="warn" size={22} /></span>
        <div className="grow">
          <b>{name} needs help{time ? ` · ${time}` : ''}</b>
          <span>{hasPlace ? (ev.gps ? 'Hold for help pressed. The map shows where the phone was.' : 'Hold for help pressed. The map shows the home area, not an exact spot.') : 'Hold for help pressed. No location came with it.'}</span>
        </div>
      </div>
      <div className="fm-sos-acts">
        {call && <a className="pill light fm-sos-call" href={`tel:${call}`}>Call {name}</a>}
        {hasPlace && <a className="pill fm-sos-glass" href={mapLink(ev.lat as number, ev.lon as number)} target="_blank" rel="noopener noreferrer">Open map</a>}
      </div>
      <button type="button" className="pill fm-sos-glass fm-sos-911" onClick={() => void callFirstContact([], { emergency: true })}>Call 911</button>
      <div className="fm-sos-foot">
        <span>Shows each time you open Bantay until you mark it handled.</span>
        <button type="button" className="fm-sos-done" onClick={() => void markSeen(row.id).catch(() => undefined)}>Mark handled</button>
      </div>
    </section>
  )
}
