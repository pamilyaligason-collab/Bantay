import type { Place } from './SafetyPages'
import { alertRef } from '../location/place'
import { pickLocalSet } from '../location/geo'
import NewsTop5 from './NewsTop5'
import PhoneWarnings from './PhoneWarnings'
import { WARNINGS_FALLBACK, WARNINGS_SOURCE_LINE } from './stormMode'
import SafetyBrief from './SafetyBrief'
import './safety.css'

/** The hub zone id news is tagged with, or null outside every area. */
const newsZone = (place: Place) => { const p = pickLocalSet(place.weather); return p.where === 'area' ? p.area.id : null }

export default function Warnings({ place }: { place: Place }) {
  return (
    <>
      <section aria-label="Official warnings"><SafetyBrief loc={alertRef(place)} /></section>
      <p className="sub" style={{ margin: '0 4px' }}>{WARNINGS_SOURCE_LINE} <a href="https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin" target="_blank" rel="noopener noreferrer">Open the PAGASA bulletin</a></p>
      <details className="sub" style={{ margin: '0 4px' }}><summary>If a source is down</summary>{WARNINGS_FALLBACK}</details>
      <PhoneWarnings level={2} />
      <section aria-labelledby="s-news"><h2 id="s-news" className="hd">Safety news</h2><NewsTop5 zone={newsZone(place)} /></section>
    </>
  )
}
