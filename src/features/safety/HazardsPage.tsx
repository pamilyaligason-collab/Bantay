import { useState } from 'react'
import { HOME_ZONES } from '../location/geo'
import { coversHere } from './dial'
import { hazardLabel, hazardsFor } from './hazardCards'
import { InfoSheet, type Place } from './SafetyPages'
import './safety.css'

export default function HazardPage({ place }: { place: Place }) {
  const [src, setSrc] = useState(false)
  const v = coversHere(place) ? hazardsFor(place.zone) : null
  const zone = HOME_ZONES.find((z) => z.id === place.zone) ?? HOME_ZONES[0]
  if (!v) return <p className="sf-empty">No hazard readings for {place.source === 'zone' ? 'this zone' : 'where you are'} yet. <a href="https://hazardhunter.georisk.gov.ph/" target="_blank" rel="noopener noreferrer">Check HazardHunterPH</a>.</p>
  return (
    <div className="sf">
      <p className="sub" style={{ margin: '0 4px' }}>
        Readings for {zone.name}.
        <button type="button" className="sf-i" aria-label="Where these readings came from" onClick={() => setSrc(true)}>i</button>
      </p>
      {v.cards.map((c) => (
        <article key={c.id} className={`sf-hz-card ${c.tone}`} aria-label={c.title}>
          <div className="sf-hz-top"><h2>{c.title}</h2><span className="sf-hz-lvl">{hazardLabel(c)}</span></div>
          {c.readings.length > 1 && c.readings.map((r) => (
            <p key={r.label} className="sf-hz-read">{r.label}: <b>{r.value ?? 'Not confirmed yet'}</b></p>
          ))}
          <p className="sf-hz-do">{c.todo}</p>
        </article>
      ))}
      {v.rest.length > 0 && (
        <div className="grp">
          {v.rest.map((r) => (
            <div key={r.label} className="row sf-hz"><span className="grow">{r.label}</span><span>{r.value ?? 'Not confirmed yet'}</span></div>
          ))}
        </div>
      )}
      <a className="btn2 sf-ico" href={v.url} target="_blank" rel="noopener noreferrer">Open HazardHunterPH</a>
      {src && <InfoSheet title="Where these readings came from" onClose={() => setSrc(false)}><p className="sf-sheet-p">Source: {v.source}. Levels can change. Check HazardHunterPH for your exact street.</p></InfoSheet>}
    </div>
  )
}
