import { useEffect, useRef, useState } from 'react'
import { useKv } from '../shell/useKv'
import { loadFamily } from '../auth/family'
import { normalizeContacts } from './contacts'
import SosContactsPicker from './SosContactsPicker'
import { track } from '../admin/events'
import { addHistory } from './history'
import { sosPosition, type SosFix } from './locate'
import { mapLink, SAFE_BODY, smsUri, sosBody } from './sms'
import { SosStatus } from './SosStatus'
import { useSelf } from './useSelf'
import './sos.css'

const NONE: unknown[] = []
const clock = (at: number) => new Date(at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** The SOS flow after the hold: find the phone (GPS, 10 s, else home zone), open the text, then the status page.
 *  No push here: the family app alert needs the server (a later wave). Calling 911 works from the first second. */
export default function SosScreen({ onClose }: { onClose: () => void }) {
  const [raw, setRaw, loaded] = useKv<unknown[]>('sos.contacts', NONE)
  const contacts = normalizeContacts(raw, loadFamily()).filter((c) => c.phone.trim())
  const { name } = useSelf()
  const [fix, setFix] = useState<SosFix | null>(null)
  const [safe, setSafe] = useState(false)
  const [opened, setOpened] = useState(false) // the text app was opened with the message (all we can know)
  const [add, setAdd] = useState(false) // stays open once shown, so the picker does not vanish while a second contact is typed
  const tried = useRef(false)
  const started = useRef(Date.now())

  useEffect(() => {
    let live = true
    void sosPosition().then((f) => live && setFix(f))
    return () => { live = false }
  }, [])

  const body = fix ? sosBody({ name, lat: fix.lat, lon: fix.lon, time: clock(fix.at), gps: fix.gps }) : ''
  const uri = fix ? smsUri(contacts, body) : null

  // Once the place is known: log it, and open the text once. A browser may block a link that no tap started, so the button below stays.
  useEffect(() => {
    if (!fix || !loaded || tried.current) return
    tried.current = true
    if (!uri) setAdd(true)
    const e = { at: fix.at, lat: fix.lat, lon: fix.lon, gps: fix.gps, texted: !!uri }
    void addHistory(e)
    void track('action', 'sos_sent')
    if (uri) { setOpened(true); window.location.href = uri }
  }, [fix, loaded, uri])

  const imSafe = () => {
    const u = smsUri(contacts, SAFE_BODY)
    setSafe(true)
    if (u) window.location.href = u
  }

  if (safe) {
    return (
      <div className="sh sos-page">
        <div className="sos-banner sos-banner-ok"><h2>Glad you are safe</h2><p>SOS is off. If your text did not open, send &quot;{SAFE_BODY}&quot; to your contacts.</p></div>
        <button type="button" className="btn2" onClick={onClose}>Back to Safety</button>
      </div>
    )
  }

  return (
    <div className="sh sos-page">
      <div className="sos-banner" role="status">
        <div className="sos-eyebrow">SOS is on · started {clock(started.current)}</div>
        <h2>{fix ? (uri ? 'Your text is ready to send' : 'Call 911 now') : 'Finding where you are'}</h2>
        <p>{fix ? 'If you can, stay where you are. Call 911 if it is an emergency.' : 'This takes up to 10 seconds. You can call 911 right now.'}</p>
      </div>
      <a href="tel:911" className="sos-911">Call 911</a>
      {fix && uri && (
        <a href={uri} className="sos-text" onClick={() => setOpened(true)}>Open the text to {contacts.map((c) => c.name || c.phone).join(' and ')}</a>
      )}
      {fix && uri && <SosStatus contacts={contacts} opened={opened} />}
      {add && (
        <div className="sos-need">
          <b>{uri ? 'Who gets the text' : 'Nobody will get a text yet'}</b>
          <p className="sub">Add up to 2 people. Next time you press SOS, Bantay opens a text to them with your place.</p>
          <SosContactsPicker onSaved={setRaw} />
        </div>
      )}
      {fix && (
        <div className="sos-where">
          <b>{fix.gps ? 'Your location' : 'Home area (no GPS found)'}</b>
          <a href={mapLink(fix.lat, fix.lon)} target="_blank" rel="noopener noreferrer">{fix.lat.toFixed(5)}, {fix.lon.toFixed(5)} · {clock(fix.at)}</a>
        </div>
      )}
      <button type="button" className="sos-safe" onClick={imSafe} disabled={!fix}>I&apos;m safe now</button>
      <button type="button" className="sos-alt" onClick={onClose}>Sent by mistake. Close</button>
    </div>
  )
}
