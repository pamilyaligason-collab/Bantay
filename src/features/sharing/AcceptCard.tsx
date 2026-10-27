import { useCallback, useEffect, useState } from 'react'
import { loadFamily } from '../auth/family'
import { acceptShare, pendingOffers, shareCopy, type Offer } from './api'
import './sharing.css'

/** Mounted at the top of Family > People (lane J hook). "<name> wants to share their health records with you": Accept or Not now.
 *  The name comes from the family list cached at sign-in (a carer cannot read the person's row until they accept). Renders nothing when there is no offer. */
export function AcceptCard() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { void pendingOffers().then((o) => setOffers(o ?? [])) }, [])
  useEffect(() => {
    load()
    const on = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [load])
  const answer = async (o: Offer, accept: boolean) => {
    setBusy(o.personId); setErr('')
    const ok = await acceptShare(o.personId, accept)
    setBusy(null)
    if (!ok) { setErr(shareCopy('offline')); return }
    setOffers((cur) => cur.filter((x) => x.personId !== o.personId))
  }
  if (offers.length === 0) return null
  const family = loadFamily()
  return (
    <div className="sg-accept" role="region" aria-label="Someone wants to share with you">
      {offers.map((o) => {
        const name = family.find((f) => f.personId === o.personId)?.displayName ?? 'Someone in your family'
        return (
          <div key={o.personId} className="sh-card sg-offer">
            <b>{name} wants to share their health records with you</b>
            <div className="sh-sub">You see nothing until you tap Accept.{o.canWrite ? ' You would also get their missed-dose alerts.' : ''}</div>
            <div className="sg-btns">
              <button type="button" className="sh-pill sh-primary" disabled={busy === o.personId} onClick={() => void answer(o, true)}>Accept</button>
              <button type="button" className="sh-pill sh-ghost" disabled={busy === o.personId} onClick={() => void answer(o, false)}>Not now</button>
            </div>
          </div>
        )
      })}
      {err && <p className="sh-sub sh-note" role="alert">{err}</p>}
    </div>
  )
}

export default AcceptCard
