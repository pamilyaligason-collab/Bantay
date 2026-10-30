import { type ReactNode, useState } from 'react'
import { HOME_ZONES } from './geo'
import { type useLocation, usePlaceFrom } from './useLocation'

const short = (n: string) => n.split(',')[0]!

/** D-33 / A-89: the place chip on Safety. Tap it to choose Current (the phone's position) or a home zone.
 *  A zone pick is what zone data uses when the member is outside the Philippines or the phone has no position. */
export default function ZonePicker({ loc }: { loc: ReturnType<typeof useLocation> }) {
  const place = usePlaceFrom(loc)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<ReactNode>('')
  if (!place) return null
  const zone = HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]
  const label = place.source === 'gps' ? `Near you · ${short(zone.name)}` : place.source === 'gps-abroad' ? `Away · ${short(zone.name)}` : short(zone.name)
  const current = async () => {
    setMsg('')
    const l = await place.ask().catch(() => null)
    if (l?.source === 'gps') return setOpen(false)
    const st = await navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state, () => 'prompt')
    setMsg(st === 'denied'
      ? <>Location is blocked for Bantay.<ol style={{ margin: '4px 0 0', paddingLeft: 22 }}><li>Open your phone Settings.</li><li>Tap Apps, then Bantay.</li><li>Tap Permissions, then Location.</li><li>Choose Allow.</li></ol></>
      : 'We could not find your location. Turn on Location on your phone, go near a window, and try again.')
  }
  const pills: [string, string, boolean, () => void][] = [
    ['current', 'Current', place.source === 'gps', current],
    ...HOME_ZONES.map((z): [string, string, boolean, () => void] => [z.id, short(z.name), place.source !== 'gps' && place.zone === z.id, () => { setMsg(''); void place.pickZone(z.id) }])
  ]
  return (
    <div className="zp">
      <button type="button" className="sf-chip" aria-expanded={open} aria-controls="zp-list" aria-label={`Place: ${label}. Change`} onClick={() => setOpen(!open)}>{label}</button>
      {open && (
        <div id="zp-list" role="group" aria-label="Zone" className="sf-chips">
          {pills.map(([id, text, on, go]) => (
            <button key={id} type="button" className="pill" aria-pressed={on} onClick={go} style={{ background: on ? 'var(--btn)' : 'var(--fill)', color: on ? 'var(--btn-fg)' : 'var(--ink)' }}>{text}</button>
          ))}
          {place.source === 'gps' && <p className="sf-empty" style={{ flexBasis: '100%' }}>Following your phone. Your zone pick is used when you are away from the Philippines or location is off.</p>}
          {msg && <div className="sf-empty" role="status" style={{ flexBasis: '100%' }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}
