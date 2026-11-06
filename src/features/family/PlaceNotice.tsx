import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { useSelfPersonId } from '../setup/useProfile'
import { useKv } from '../shell/useKv'
import { feedShareSet, shareCopy } from '../sharing/api'
import { refreshLocation } from '../location/useLocation'
import { useActing } from '../viewas/viewAs'
import { familyPlacesOn } from './flags'
import { PLACE_NOTICE_KEY, placeNoticeKey, setPlaceSharing, syncPlaceSwitch } from './placeApi'
import './place.css'

export { PLACE_NOTICE_KEY }
export const PLACE_NOTICE = 'Your family can see where your phone was the last time Bantay was open. Turn off any time.'
export const OFFLINE_NOTE = 'Needs internet to change'

/** First-open notice for place sharing (D-138: on by default for people who sign in, so it says so once). Mounted on Family and on Today (whichever opens first), once per person, never while viewing as someone, and not when the switch is already off. */
export default function PlaceNotice() {
  const selfId = useSelfPersonId()
  return selfId ? <Notice key={selfId} selfId={selfId} /> : null // keyed: another person's "seen" never carries over
}

function Notice({ selfId }: { selfId: string }) {
  const { acting } = useActing()
  const [seen, setSeen, loaded] = useKv<boolean>(placeNoticeKey(selfId), false)
  const [off, setOff] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!familyPlacesOn() || acting) return
    let live = true
    void syncPlaceSwitch(selfId).then((on) => { if (live && on === false) setOff(true) })
    return () => { live = false }
  }, [selfId, acting])
  if (!familyPlacesOn() || !supabase || acting || !loaded || seen || off) return null
  const turnOff = async () => {
    setBusy(true); setNote('')
    const r = await feedShareSet(selfId, 'place', false)
    setBusy(false)
    if (r === 'ok') { await setPlaceSharing(selfId, false); setSeen(true) }
    else setNote(r === 'offline' ? OFFLINE_NOTE : shareCopy(r))
  }
  const ok = () => { setSeen(true); void refreshLocation({ force: true }) } // the first pin is written now, not at the next open
  return (
    <section className="card pl-note" data-testid="place-notice" aria-label="Sharing your place">
      <p>{PLACE_NOTICE}</p>
      {note && <p role="status">{note}</p>}
      <div className="pl-note-actions">
        <button type="button" disabled={busy} onClick={() => void turnOff()}>Turn off</button>
        <button type="button" className="pl-ok" disabled={busy} onClick={ok}>OK</button>
      </div>
    </section>
  )
}
