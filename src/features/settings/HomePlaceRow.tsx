import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { db } from '../../db'
import { nearestCity, searchCities } from '../location/homeCities'
import { asHome } from '../location/place'
import { clearHome, HOME_KEY, resolveLocation, saveHome } from '../location/useLocation'
import { phoneZone } from '../time/zone'
import { NavRow } from './Group'
import './settings.css'

/** S30 L9 (F1): "My home place". Each member sets their OWN: it is kept on this phone only (kv loc.home) and stands in for the last Philippine zone, for weather, place words and the
 *  time zone of the place, whenever the phone has no fresh position. Philippine alerts for the family stay on their own zones. */
export function useHomeSaved(): ReturnType<typeof asHome> | undefined {
  const [home, setHome] = useState<ReturnType<typeof asHome> | undefined>(undefined)
  useEffect(() => {
    const sub = liveQuery(async () => asHome((await db.kv.get(HOME_KEY))?.value)).subscribe({ next: setHome, error: () => setHome(null) })
    return () => sub.unsubscribe()
  }, [])
  return home
}

const r2 = (n: number) => Math.round(n * 100) / 100 // about 1 km: a home place is a town, not a street
const usable = (tz: string | null) => (tz && !/^(UTC|GMT|Etc\/)/.test(tz) ? tz : undefined)

function HomeSheet({ saved, onClose }: { saved: ReturnType<typeof asHome>; onClose: () => void }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!history.state?.bantayChoice) history.pushState({ bantayChoice: 1 }, '')
    window.addEventListener('popstate', onClose)
    return () => window.removeEventListener('popstate', onClose)
  }, [onClose])
  const close = () => (history.state?.bantayChoice ? history.back() : onClose())
  const results = searchCities(text)
  const pick = async (h: { name: string; lat: number; lon: number; tz?: string }) => { await saveHome(h); close() }
  const useHere = async () => {
    if (busy) return
    setBusy(true)
    setMsg('')
    const l = await resolveLocation(true).catch(() => null)
    setBusy(false)
    if (l?.source !== 'gps') return setMsg('We could not find your location. Turn on Location on your phone, go near a window, and try again.')
    const near = nearestCity(l)
    await pick({ name: near?.name ?? 'My current place', lat: r2(l.lat), lon: r2(l.lon), tz: usable(phoneZone()) ?? near?.tz })
  }
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={close}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="My home place" onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">My home place</h2>
        <p className="sh-sub st-note15">Bantay uses it for your weather, your place name and your local time when your phone has no position. It stays on this phone. Alerts for the family in the Philippines do not change.</p>
        <label className="st-search"><span className="sh-sub st-note15">Search a city</span><input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Houston" autoComplete="off" /></label>
        <div role="group" aria-label="Places" className="st-radios">
          {results.length === 0 && <p className="sh-sub st-note15" role="status">No city in the list. Use your phone's place below.</p>}
          {results.map((c) => (
            <button key={c.name} type="button" className="st-rad" aria-pressed={saved?.name === c.name} onClick={() => void pick(c)}>{c.name}</button>
          ))}
        </div>
        <button type="button" className="sh-pill sh-primary sh-block" disabled={busy} onClick={() => void useHere()}>Use my phone's place now</button>
        {msg && <p className="sh-sub st-note15" role="status">{msg}</p>}
        {saved && <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => void clearHome().then(close)}>Remove my home place</button>}
        <button type="button" className="sh-pill sh-ghost sh-block" onClick={close}>Cancel</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

export default function HomePlaceRow() {
  const saved = useHomeSaved()
  const [open, setOpen] = useState(false)
  if (saved === undefined) return null // until the phone has answered, so "Not set" never flashes over a saved place
  return (
    <>
      <NavRow icon="pin" tint="green" title="My home place" sub={saved ? saved.name : 'Not set'} onClick={() => setOpen(true)} popup testId="home-place-row" />
      {open && <HomeSheet saved={saved} onClose={() => setOpen(false)} />}
    </>
  )
}
