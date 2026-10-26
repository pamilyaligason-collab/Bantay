import { useEffect, useState } from 'react'
import SafetyHub, { IdsRow } from '../features/safety/SafetyHub'
import { ActEarly, FirstAidPage, topicOf } from '../features/safety/FirstAid'
import SafetySub, { subOf } from '../features/safety/SafetyPages'
import GoBag from '../features/gobag/GoBag'
import MedicalId from '../features/medid/MedicalId'
import SosButton from '../features/sos/SosButton'
import SosScreen from '../features/sos/SosScreen'
import { pickLocalSet } from '../features/location/geo'
import { useLocation, usePlaceFrom } from '../features/location/useLocation'
import { ABROAD_SOURCE } from '../features/safety/dial'
import ZonePicker from '../features/location/ZonePicker'
import { Group } from '../features/safety/Group'
import { Icon } from '../features/shell/Icon'
import '../features/safety/safety.css'

/** #medid and #gobag are sub-screens of this tab (routes.ts keeps the Safety tab lit); #safety/<page> are the hub pages (D-68). */
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
  return h === '#medid' || h.startsWith('#medid/') ? <MedicalId /> : h === '#gobag' ? <GoBag /> : <SafetyRoute hash={h} />
}

function SafetyRoute({ hash }: { hash: string }) {
  const l = useLocation()
  const place = usePlaceFrom(l)
  const sub = subOf(hash)
  const fa = topicOf(hash)
  if (fa) return <FirstAidPage topic={fa} />
  return sub ? <SafetySub sub={sub} l={l} place={place} /> : <SafetyHome l={l} place={place} />
}

/** D-68: SOS and the two call buttons stay on top, then a grid of tiles that each open a page.
 *  D-33: one place for the whole screen. Warnings rank from the phone inside the Philippines, else from the zone; zone data (numbers, evacuation, hazards) uses the zone. */
function SafetyHome({ l, place }: { l: ReturnType<typeof useLocation>; place: ReturnType<typeof usePlaceFrom> }) {
  const [sos, setSos] = useState(false)
  // 911 only works in the Philippines and the US (Texas). Elsewhere abroad it would dial nothing useful: point at the official list instead.
  const abroad = !!place && pickLocalSet(place.weather).where === 'abroad'
  if (sos) return <SosScreen onClose={() => setSos(false)} />
  return (
    <>
      <div className="hdr sf-hdr">
        <h1>Safety</h1>
        <ZonePicker loc={l} />
      </div>
      <Group id="sf-g-emerg" tone="emergency" title="Emergency" sub="Hold SOS to alert your family, or call for help now.">
      <SosButton onSend={() => setSos(true)} />
      <div className="sf-pair">
        {abroad
          ? <a href={ABROAD_SOURCE.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ background: 'var(--danger-bg)' }}>Local emergency number</a>
          : <a href="tel:911" className="btn" style={{ background: 'var(--danger-bg)' }}>Call 911</a>}
        <a href="#medid" className="btn2 sf-ico"><Icon name="cross" size={20} />Medical ID</a>
      </div>
      <IdsRow />
      </Group>
      <ActEarly />
      {place && <SafetyHub place={place} />}
      <p className="sub" style={{ margin: '0 4px', fontSize: 13 }}>Bantay is not an earthquake or tsunami siren. Cards are written in plain words from NDRRMC, PAGASA, PHIVOLCS, DOH, Red Cross, WHO and Ready.gov. Posters are drawn for Bantay. Maps by Ventusky, Windy, HazardHunterPH and PAGASA. <a href="#safety/sources">Sources</a></p>
    </>
  )
}
