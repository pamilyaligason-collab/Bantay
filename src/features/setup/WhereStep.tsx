import { useState } from 'react'
import { HOME_ZONES } from '../location/geo'
import { ZONE_KEY, resolveLocation } from '../location/useLocation'
import { Icon } from '../shell/Icon'
import { put } from './steps'

const CHIP: Record<(typeof HOME_ZONES)[number]['id'], string> = { dampas: 'Dampas, Tagbilaran', conel: 'Conel, GenSan' }

/** Onboarding screen 4: one tap. No latitude or longitude typing (A-17); the zone is the same one Weather offers (ZONE_KEY). */
export default function WhereStep({ onNext }: { onNext: () => void }) {
  const [busy, setBusy] = useState(false)
  const [miss, setMiss] = useState(false)
  const zone = async (id: string) => { await put(ZONE_KEY, id); await put('loc.asked', true); onNext() }
  const gps = async () => {
    setBusy(true); setMiss(false)
    const l = await resolveLocation(true) // sets loc.asked; a denial falls back to the saved zone
    setBusy(false)
    if (l.source === 'gps') onNext(); else setMiss(true)
  }
  return (
    <div className="ob-page">
      <div className="hdr"><h1>Where are you most days?</h1><span>For weather and quake warnings near you. Stays on this phone.</span></div>
      <div className="ob-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void gps()}><Icon name="pin" size={20} />Use my location</button>
        {miss && <p className="ob-bad" role="status">We could not get your location. Pick a place below.</p>}
        {HOME_ZONES.map((z) => <button key={z.id} type="button" className="btn2" onClick={() => void zone(z.id)}>{CHIP[z.id]}</button>)}
      </div>
    </div>
  )
}
