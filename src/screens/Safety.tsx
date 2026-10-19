import { useEffect, useState } from 'react'
import hotlines from '../data/safety/hotlines.json'
import places from '../data/safety/places.json'
import EntryList from '../features/safety/EntryList'
import type { Entry } from '../features/safety/entries'
import LiveMaps from '../features/safety/LiveMaps'
import MapsPanel from '../features/safety/MapsPanel'
import NewsTop5 from '../features/safety/NewsTop5'
import PhoneWarnings from '../features/safety/PhoneWarnings'
import Practice, { Hazards } from '../features/safety/Practice'
import SafetyBrief from '../features/safety/SafetyBrief'
import GoBag from '../features/gobag/GoBag'
import MedicalId from '../features/medid/MedicalId'
import SosButton from '../features/sos/SosButton'
import SosHistory from '../features/sos/SosHistory'
import SosScreen from '../features/sos/SosScreen'
import { alertRef } from '../features/location/place'
import { useLocation, usePlaceFrom } from '../features/location/useLocation'
import ZonePicker from '../features/location/ZonePicker'
import { Icon } from '../features/shell/Icon'
import '../features/safety/safety.css'

/** #medid and #gobag are sub-screens of this tab (routes.ts keeps the Safety tab lit). */
function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const on = () => setH(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return h
}

export default function Safety() {
  const h = useHash()
  return h === '#medid' ? <MedicalId /> : h === '#gobag' ? <GoBag /> : <SafetyHome />
}

/** D-62 order: SOS, Call 911 + Medical ID, My IDs + Insurance, warnings, quick dial, then live weather and maps, evacuation, hazards, cards.
 *  D-33: one place for the whole screen. Warnings rank from the phone inside the Philippines, else from the zone; zone data (numbers, evacuation, hazards) uses the zone. */
function SafetyHome() {
  const l = useLocation()
  const place = usePlaceFrom(l)
  const [sos, setSos] = useState(false)
  const phone = place && place.source !== 'zone' ? place.weather : null // the phone's own position, also abroad (Near me map)
  if (sos) return <SosScreen onClose={() => setSos(false)} />
  return (
    <>
      <div className="hdr sf-hdr">
        <h1>Safety</h1>
        <ZonePicker loc={l} />
      </div>
      <SosButton onSend={() => setSos(true)} />
      <div className="sf-pair">
        <a href="tel:911" className="btn" style={{ background: 'var(--danger-bg)' }}>Call 911</a>
        <a href="#medid" className="btn2 sf-ico"><Icon name="cross" size={20} />Medical ID</a>
      </div>
      <div className="sf-pair">
        <a href="#docs" className="btn2" aria-label="My IDs. Add or view your ID cards">My IDs</a>
        <a href="#docs/insurance" className="btn2" aria-label="Insurance. Add or view your insurance cards">Insurance</a>
      </div>
      <SosHistory />
      {place && (<>
      <section aria-labelledby="s-warn"><h2 id="s-warn" className="hd">Warnings</h2><SafetyBrief loc={alertRef(place)} /></section>
      <section aria-labelledby="s-hot"><h2 id="s-hot" className="hd">Quick dial</h2><EntryList seed={hotlines as Entry[]} geo={false} zone={place.zone} /></section>
      <section aria-labelledby="s-wx"><h2 id="s-wx" className="hd">Live weather</h2><LiveMaps loc={place.weather} /></section>
      <section aria-labelledby="s-map"><h2 id="s-map" className="hd">Live maps</h2><MapsPanel loc={phone} ask={l.ask} zone={place.zone} /></section>
      <section aria-labelledby="s-evac"><h2 id="s-evac" className="hd">Evacuation and rescue</h2><EntryList seed={places as Entry[]} geo zone={place.zone} /></section>
      <PhoneWarnings level={2} />
      <section aria-labelledby="s-haz"><h2 id="s-haz" className="hd">Hazards at home</h2><Hazards zone={place.zone} /></section>
      <a href="#gobag" className="btn2 sf-ico">Go-bag checklist</a>
      <section aria-labelledby="s-cards"><h2 id="s-cards" className="hd">Safety cards</h2><Practice /></section>
      </>)}
      <section aria-labelledby="s-news"><h2 id="s-news" className="hd">News</h2><NewsTop5 /></section>
      <p className="sub" style={{ margin: '0 4px', fontSize: 13 }}>Bantay is not an earthquake or tsunami siren. Cards are written in plain words from NDRRMC, PAGASA, PHIVOLCS, DOH, Red Cross, WHO and Ready.gov. Posters are drawn for Bantay. Maps by Ventusky, Windy, HazardHunterPH and PAGASA. Sources and dates are in docs/SOURCES.md.</p>
    </>
  )
}
