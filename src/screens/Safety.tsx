import hotlines from '../data/safety/hotlines.json'
import places from '../data/safety/places.json'
import EntryList from '../features/safety/EntryList'
import type { Entry } from '../features/safety/entries'
import MapsPanel from '../features/safety/MapsPanel'
import NewsTop5 from '../features/safety/NewsTop5'
import PhoneWarnings from '../features/safety/PhoneWarnings'
import Practice, { Hazards } from '../features/safety/Practice'
import SafetyBrief from '../features/safety/SafetyBrief'
import { alertRef } from '../features/location/place'
import { useLocation, usePlaceFrom } from '../features/location/useLocation'
import ZonePicker from '../features/location/ZonePicker'
import '../features/safety/safety.css'

/** D-62 order: 911, IDs + Insurance, advisory card, Quick dial, Live maps, then the rest. SOS and Medical ID join the top when they ship (P4, P5).
 *  D-33: one place for the whole screen. Warnings rank from the phone inside the Philippines, else from the zone; zone data (numbers, evacuation, hazards) uses the zone. */
export default function Safety() {
  const l = useLocation()
  const place = usePlaceFrom(l)
  const phone = place && place.source !== 'zone' ? place.weather : null // the phone's own position, also abroad (Near me map)
  return (
    <>
      <div className="hdr">
        <h1>Safety</h1>
        <ZonePicker loc={l} />
      </div>
      <div className="sf-pair">
        <a href="tel:911" className="btn" style={{ background: 'var(--danger-bg)' }}>Call 911</a>
      </div>
      <div className="sf-pair">
        <a href="#docs" className="btn2" aria-label="My IDs. Add or view your ID cards">My IDs</a>
        <a href="#docs/insurance" className="btn2" aria-label="Insurance. Add or view your insurance cards">Insurance</a>
      </div>
      {place && (<>
      <section aria-labelledby="s-warn"><h2 id="s-warn" className="hd">Warnings</h2><SafetyBrief loc={alertRef(place)} /></section>
      <section aria-labelledby="s-hot"><h2 id="s-hot" className="hd">Quick dial</h2><EntryList seed={hotlines as Entry[]} geo={false} zone={place.zone} /></section>
      <section aria-labelledby="s-map"><h2 id="s-map" className="hd">Live maps</h2><MapsPanel loc={phone} ask={l.ask} zone={place.zone} /></section>
      <section aria-labelledby="s-evac"><h2 id="s-evac" className="hd">Evacuation and rescue</h2><EntryList seed={places as Entry[]} geo zone={place.zone} /></section>
      <PhoneWarnings level={2} />
      <section aria-labelledby="s-haz"><h2 id="s-haz" className="hd">Hazards at home</h2><Hazards zone={place.zone} /></section>
      <section aria-labelledby="s-cards"><h2 id="s-cards" className="hd">Safety cards</h2><Practice /></section>
      </>)}
      <section aria-labelledby="s-news"><h2 id="s-news" className="hd">News</h2><NewsTop5 /></section>
      <p className="sub" style={{ margin: '0 4px', fontSize: 13 }}>Bantay is not an earthquake or tsunami siren. Cards are written in plain words from NDRRMC, PAGASA, PHIVOLCS, DOH, Red Cross, WHO and Ready.gov. Posters are drawn for Bantay. Maps by Ventusky, Windy, HazardHunterPH and PAGASA. Sources and dates are in docs/SOURCES.md.</p>
    </>
  )
}
