import { useKv } from '../safety/store'
import { HISTORY_KEY, type SosEvent } from './history'
import { mapLink } from './sms'
import './sos.css'

const NONE: SosEvent[] = []
const when = (at: number) => new Date(at).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Last 10 SOS on this phone: time and place. Nothing shown until there is one. */
export default function SosHistory() {
  const raw = useKv<SosEvent[]>(HISTORY_KEY, NONE)
  const list = Array.isArray(raw) ? raw.filter((e) => e && Number.isFinite(e.at) && Number.isFinite(e.lat) && Number.isFinite(e.lon)) : []
  if (!list.length) return null
  return (
    <section aria-labelledby="s-sos-h">
      <h2 id="s-sos-h" className="hd">Past SOS</h2>
      <ul className="sos-hist">
        {list.map((e) => (
          <li key={e.at}>
            <span>{when(e.at)}{e.texted ? '' : ' · no text'}</span>
            <a href={mapLink(e.lat, e.lon)} target="_blank" rel="noopener noreferrer">{e.gps ? 'Map' : 'Home area'}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}
