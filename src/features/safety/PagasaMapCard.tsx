import { useState } from 'react'
import { Section } from '../look'
import { Icon } from '../shell/Icon'
import { Frame } from './MapsPanel'
import './pagasa.css'

/** panahon.gov.ph sends no frame block (curl -I 2026-11-09: no X-Frame-Options, CSP only upgrade-insecure-requests); www.pagasa.dost.gov.ph sends SAMEORIGIN, so it can only be linked. */
export const PAGASA_MAP_URL = 'https://panahon.gov.ph/'
export const PAGASA_OUTLOOK_URL = 'https://www.pagasa.dost.gov.ph/climate/climate-prediction/seasonal-forecast'

/** S28: PAGASA's own weather map on Today. Nothing is fetched from panahon.gov.ph until the person taps "Load the map" (the poster is local); the outlook is a plain link, never scraped.
 *  Sits below every warning (D-50); the PagasaToday warning card stays where it is. */
export default function PagasaMapCard() {
  const [open, setOpen] = useState(false)
  return (
    <Section title="PAGASA weather map and outlook" testId="pagasa-map-section">
      <div className="card pgm" data-testid="pagasa-map-card">
        {open ? (
          <Frame title="PAGASA weather map" src={PAGASA_MAP_URL} />
        ) : (
          <button type="button" className="pgm-poster" onClick={() => setOpen(true)}>
            <Icon name="map" size={32} />
            <b className="cd-title">PAGASA weather map</b>
            <span className="cd-meta">Tap to load the live map from panahon.gov.ph. Nothing loads until you tap.</span>
            <span className="pgm-go">Load the map</span>
          </button>
        )}
        <a className="pgm-link" href={PAGASA_OUTLOOK_URL} target="_blank" rel="noopener noreferrer">PAGASA climate outlook and forecasts<Icon name="out" size={18} /><span className="pg-vh"> (opens in browser)</span></a>
        {open && <a className="pgm-link" href={PAGASA_MAP_URL} target="_blank" rel="noopener noreferrer">Open the map in the browser<Icon name="out" size={18} /><span className="pg-vh"> (opens in browser)</span></a>}
        <p className="cd-meta pgm-note">PAGASA is the official word.</p>
      </div>
    </Section>
  )
}
