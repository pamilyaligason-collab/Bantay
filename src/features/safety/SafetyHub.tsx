import hotlines from '../../data/safety/hotlines.json'
import places from '../../data/safety/places.json'
import { ALL_IDS } from '../gobag/items'
import { KEY as BAG_KEY, EMPTY as BAG_EMPTY, readState } from '../gobag/state'
import { alertRef } from '../location/place'
import type { usePlaceFrom } from '../location/useLocation'
import { HISTORY_KEY, type SosEvent } from '../sos/history'
import { manilaLocal, rainBody, rainOutlook, skyOf, type Wx } from '../today/heroCards'
import { useWeather } from '../today/weather'
import { ALERTS_KEY, type Alert, rankAlerts } from './alerts'
import { splitDial } from './dial'
import { type Entry, forZone, hasPoint, OVERRIDES_KEY, type Overrides, withOverrides } from './entries'
import { hazardsFor, hazardStatus } from './hazardCards'
import { cyclones, stormName } from './LiveMaps'
import { CARDS } from './Practice'
import { useKv } from './store'
import './safety.css'

type Place = NonNullable<ReturnType<typeof usePlaceFrom>>
const NONE_A: Alert[] = []
const NONE_O: Overrides = {}
const NONE_S: SosEvent[] = []
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// 24px stroke paths in the same style as shell/Icon
const ICONS: Record<string, string> = {
  warn: 'M12 3 2.5 20h19zM12 10v4.5M12 17.2v.3',
  weather: 'M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 8.5 4.8 4.8 0 0 1 17 18zM9 21l1-2M13 21l1-2',
  storm: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M12 3a9 9 0 0 1 8.5 6M12 21a9 9 0 0 1-8.5-6M6 6.5A9 9 0 0 1 12 3M18 17.5A9 9 0 0 1 12 21',
  map: 'M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  dial: 'M6 3h4l1.5 4-2 1.5a11 11 0 0 0 6 6L17 12.5l4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
  hazard: 'M3 20h18L15 9l-3 5-2-3zM3 20l5-9',
  bag: 'M8 7V5a4 4 0 0 1 8 0v2M5 7h14l1 13H4zM9 12h6',
  cards: 'M5 4h14v16H5zM8.5 9h7M8.5 12.5h7M8.5 16h4',
  ids: 'M3 6h18v12H3zM7 11a2 2 0 1 0 0-.01M12 10h6M12 14h5',
  sos: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'
}

export function TileIcon({ name }: { name: string }) {
  return <svg className="sh-ic" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[name]} /></svg>
}

/** Same rain numbers as Today: the hourly outlook when we have it, else the day chance. */
export function rainLine(wx: Wx | null | undefined, now: Date = new Date()): string {
  if (!wx) return 'Rain, wind and clouds'
  const sky = skyOf(wx)
  const local = manilaLocal(now)
  const r = wx.hourly ? rainOutlook(wx.hourly.time, wx.hourly.prob, local, sky === 'rain' || sky === 'storm') : undefined
  return rainBody(wx, r, wx.rainPct != null && wx.rainPct >= 60, local)
}

/** Calm hub: ten big tiles, each with one live status line. Every number comes from data already on the phone. */
export default function SafetyHub({ place }: { place: Place }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE_A)
  const overrides = useKv<Overrides>(OVERRIDES_KEY, NONE_O)
  const bag = readState(useKv<unknown>(BAG_KEY, BAG_EMPTY))
  const sosRaw = useKv<SosEvent[]>(HISTORY_KEY, NONE_S)
  const wx = useWeather(place.weather)

  const warns = rankAlerts(alerts, alertRef(place)).length
  const storms = cyclones(alerts)
  const confirmed = splitDial(withOverrides(forZone(hotlines as Entry[], place.zone), overrides)).groups.reduce((n, g) => n + g.items.length, 0)
  const pins = withOverrides(forZone(places as Entry[], place.zone), overrides).filter(hasPoint).length
  const sos = Array.isArray(sosRaw) ? sosRaw.filter((e) => e && Number.isFinite(e.at)) : []
  const last = sos[0] ? new Date(sos[0].at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' }) : null

  const tiles: [string, string, string, string][] = [
    ['#safety/warnings', 'warn', 'Warnings', warns ? plural(warns, 'warning') + ' now' : 'None now'],
    ['#safety/weather', 'weather', 'Weather maps', rainLine(wx)],
    ['#safety/storms', 'storm', 'Storm tracker', storms.length ? `${stormName(storms[0]!)}${storms.length > 1 ? ` and ${storms.length - 1} more` : ''}` : 'No storms now'],
    ['#safety/map', 'map', 'Rescue map', pins ? plural(pins, 'place') + ' on the map' : 'Shelters and help'],
    ['#safety/dial', 'dial', 'Quick dial', confirmed ? `${plural(confirmed, 'number')} ready` : 'No numbers yet'],
    ['#safety/hazards', 'hazard', 'Hazards at my location', hazardStatus(hazardsFor(place.zone))],
    ['#gobag', 'bag', 'Go-bag', `${bag.done.length} of ${ALL_IDS.length} packed`],
    ['#safety/cards', 'cards', 'Safety cards', `${CARDS.length} how-to guides`],
    ['#docs', 'ids', 'IDs and insurance', 'Keep copies handy'],
    ['#safety/sos', 'sos', 'Past SOS', last ? `Last one ${last}` : 'None sent']
  ]
  return (
    <nav className="sf-tiles" aria-label="Safety topics">
      {tiles.map(([href, icon, title, status]) => (
        <a key={href} href={href} className="sf-tile">
          <span className="sf-tile-ic"><TileIcon name={icon} /></span>
          <span className="sf-tile-t">{title}</span>
          <span className="sf-tile-s">{status}</span>
        </a>
      ))}
    </nav>
  )
}
