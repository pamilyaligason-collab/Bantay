import hotlines from '../data/safety/hotlines.json'
import places from '../data/safety/places.json'
import EntryList from '../features/safety/EntryList'
import type { Entry } from '../features/safety/entries'
import MapsPanel from '../features/safety/MapsPanel'
import NewsTop5 from '../features/safety/NewsTop5'
import Practice, { Hazards } from '../features/safety/Practice'
import SafetyBrief from '../features/safety/SafetyBrief'
import type { LatLon } from '../features/safety/alerts'
import '../features/safety/safety.css'

/** `loc` is the current position when known (L5 provides it). */
export default function Safety({ loc = null }: { loc?: LatLon | null }) {
  return (
    <>
      <div className="hdr">
        <h1>Safety</h1>
        <span>Dampas, Tagbilaran City</span>
      </div>
      <a href="tel:911" className="btn" style={{ background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box', minHeight: 64, fontSize: 19 }}>Call 911</a>
      <section aria-labelledby="s-warn"><h2 id="s-warn" className="hd">Warnings</h2><SafetyBrief loc={loc} /></section>
      <section aria-labelledby="s-evac"><h2 id="s-evac" className="hd">Evacuation and rescue</h2><EntryList seed={places as Entry[]} geo /></section>
      <section aria-labelledby="s-hot"><h2 id="s-hot" className="hd">Hotlines</h2><EntryList seed={hotlines as Entry[]} geo={false} /></section>
      <section aria-labelledby="s-map"><h2 id="s-map" className="hd">Live maps</h2><MapsPanel loc={loc} /></section>
      <section aria-labelledby="s-haz"><h2 id="s-haz" className="hd">Hazards at home</h2><Hazards /></section>
      <section aria-labelledby="s-cards"><h2 id="s-cards" className="hd">Safety cards</h2><Practice /></section>
      <section aria-labelledby="s-news"><h2 id="s-news" className="hd">News</h2><NewsTop5 /></section>
      <p className="sub" style={{ margin: '0 4px', fontSize: 13 }}>Bantay is not an earthquake or tsunami siren. Cards are written in plain words from NDRRMC, PAGASA, PHIVOLCS, DOH, Red Cross, WHO and Ready.gov. Posters are drawn for Bantay. Maps by Ventusky, Windy, HazardHunterPH and PAGASA. Sources and dates are in docs/SOURCES.md.</p>
    </>
  )
}
