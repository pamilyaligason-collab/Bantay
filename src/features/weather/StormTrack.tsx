import type { LatLon } from '../location/geo'
import type { Alert } from '../safety/alerts'
import { cyclones, since, stormLine, stormName } from '../safety/LiveMaps'
import { Icon } from '../shell/Icon'

const BULLETIN = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'

/** Storm tracking from the GDACS rows the alert ingest keeps in kv (already saved on the phone, so it opens offline). One plain sentence, then each listed storm.
 *  No PAGASA machine feed is read (R1), so no signal numbers or cone are drawn: the bulletin is a link. */
export default function StormTrack({ alerts, point, placeName }: { alerts: Alert[]; point: LatLon; placeName: string }) {
  const storms = cyclones(alerts)
  const line = stormLine(storms, point, placeName)
  return (
    <div className="wx-storm" data-tone={line.tone}>
      <p className="wx-note" role="status"><b>{line.text}</b></p>
      {storms.length > 0 && (
        <ul className="grp">
          {storms.map((s) => (
            <li key={s.id} className="row"><span className="grow"><b>{stormName(s)}</b><span className="sub">Since {since(s.issuedAt)} · GDACS</span></span></li>
          ))}
        </ul>
      )}
      <p className="wx-sub">From GDACS and Open-Meteo, checked every 10 minutes; PAGASA bulletin: open.</p>
      <a className="pill primary block" href={BULLETIN} target="_blank" rel="noopener noreferrer">PAGASA bulletin <Icon name="out" size={18} /></a>
    </div>
  )
}
