import type { LatLon } from '../location/geo'
import { CHECKED_KEY, NO_STALE, STALE_KEY, feedStale, type Alert, type StaleSources } from '../safety/alerts'
import { useKv } from '../safety/store'
import { cyclones, since, stormLine, stormName } from '../safety/LiveMaps'
import { liveSignals } from '../safety/stormMode'
import { Icon } from '../shell/Icon'
import { GoRow } from './WxLive'

const BULLETIN = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'

/** Storm tracking from the GDACS rows the alert ingest keeps in kv (already saved on the phone, so it opens offline). One plain sentence, then each listed storm.
 *  No PAGASA machine feed is read (R1), so no signal numbers or cone are drawn: the bulletin is a link. */
export default function StormTrack({ alerts, point, placeName }: { alerts: Alert[]; point: LatLon; placeName: string }) {
  const storms = cyclones(alerts)
  const line = stormLine(storms, point, placeName, !feedStale(alerts, useKv<unknown>(CHECKED_KEY, null), useKv<StaleSources>(STALE_KEY, NO_STALE)), liveSignals(alerts).length)
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
      <GoRow href="#safety/storms">Storm tracker</GoRow>
      <a className="pill primary block" href={BULLETIN} target="_blank" rel="noopener noreferrer">PAGASA bulletin <Icon name="out" size={18} /></a>
    </div>
  )
}
