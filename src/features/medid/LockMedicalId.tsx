import { useEffect, useState } from 'react'
import { db } from '../../db'
import { smsNumber } from '../sos/sms'
import type { MedicalId } from './card'
import { CACHE_KEY } from './useMedicalId'
import '../privacy/privacy.css'

/** Medical ID from the fingerprint lock screen (mockup safety-medid, lock variant). Opens without unlocking, so it shows only what helps a stranger:
 *  allergies, conditions and who to call. No blood type, no medicines, no photo, nothing from the server: it reads the card cached on this phone. */
export function LockMedicalId({ onClose }: { onClose: () => void }) {
  const [card, setCard] = useState<MedicalId | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void db.kv.get(CACHE_KEY).then((r) => { if (live) setCard((r?.value as { card?: MedicalId } | undefined)?.card ?? null) }, () => { if (live) setCard(null) })
    return () => { live = false }
  }, [])
  const list = (l: string[] | undefined) => (l && l.length ? l.join(', ') : 'Not added')
  return (
    <main className="lk" aria-label="Medical ID">
      <div className="lk-hello"><div><div className="lk-eyebrow">Works without internet</div><h1>Medical ID</h1></div></div>
      {card === undefined ? <div className="lk-card" aria-busy="true">Loading...</div> : card === null ? (
        <div className="lk-card"><b>Nothing saved on this phone yet</b><span>Open Bantay and add the details in Me. Then this card shows here, without unlocking.</span></div>
      ) : (
        <>
          <div className="lk-card">
            <b>{card.name}</b>
            <dl>
              <div><dt>Allergies</dt><dd className={card.allergies?.length ? 'lk-allergy' : undefined}>{list(card.allergies)}</dd></div>
              <div><dt>Conditions</dt><dd>{list(card.conditions)}</dd></div>
            </dl>
          </div>
          <div className="lk-card">
            <b>Call in an emergency</b>
            {card.calls?.length
              ? card.calls.map((c) => <a key={c.phone} className="lk-call" href={`tel:${smsNumber(c.phone)}`}>{c.name} · {c.phone}</a>)
              : <span>Not added</span>}
          </div>
        </>
      )}
      <div className="lk-sos">
        <a className="lk-btn lk-red" href="tel:911">Call 911</a>
        <button type="button" className="lk-btn" onClick={onClose}>Back</button>
      </div>
    </main>
  )
}
