import { HOME_ZONES, type LatLon } from '../location/geo'
import { ALERTS_KEY, type Alert } from './alerts'
import { cyclones, stormLine, stormName, since, windySrc } from './LiveMaps'
import { NONE_A, type Place, useOnline } from './SafetyPages'
import { stormCentre, zoomEarthUrl } from './stormView'
import { useKv } from './store'
import './livemaps.css'
import './safety.css'

const stormLinks = (loc: LatLon) => [
  ['PAGASA bulletin', 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'],
  ['JTWC', 'https://www.metoc.navy.mil/jtwc/jtwc.html'],
  ['Zoom Earth', zoomEarthUrl(loc)]
]

export default function StormTracker({ place }: { place: Place }) {
  const online = useOnline()
  const storms = cyclones(useKv<Alert[]>(ALERTS_KEY, NONE_A))
  const zone = HOME_ZONES.find((z) => z.id === place.zone)
  const view = stormCentre(place.weather)
  const line = stormLine(storms, place.weather, (zone?.name ?? 'your place').split(',')[0]!)
  return (
    <div className="sf">
      <p className={`sf-storm-line ${line.tone}`} role="status">{line.text}</p>
      {storms.length ? (
        <div className="grp">
          {storms.map((a) => (
            <div key={a.id} className="row"><span className="grow"><span>{stormName(a)}</span><span className="sub" style={{ fontSize: 14 }}>{a.level ? `${a.level} alert` : 'Level unknown'} · since {since(a.issuedAt)}</span></span></div>
          ))}
        </div>
      ) : null}
      <div className="lm-box">
        {online
          ? <iframe className="sf-frame" title="Windy storm map around your place" src={windySrc('wind', view.lat, view.lon, view.zoom)} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups" />
          : <p className="sf-empty lm-off" role="status">Maps need internet</p>}
      </div>
      <p className="sub lm-credit">Map by Windy.com</p>
      <div className="grp">
        {stormLinks(place.weather).map(([name, url]) => (
          <a key={url} className="row" href={url} target="_blank" rel="noopener"><span className="grow"><span>{name}</span><span className="sub" style={{ fontSize: 14 }}>Opens in a new tab.</span></span></a>
        ))}
      </div>
    </div>
  )
}
